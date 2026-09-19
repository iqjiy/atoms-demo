import { MessageBus } from './bus.js';
import { ROLES, type Role } from './roles.js';
import type { ApprovalGate } from './approvalGate.js';
import { Checkpointer } from './checkpointer.js';
import { ensureHtml, injectStorageShim } from './htmlGuard.js';
import { parseFiles } from './fileParser.js';
import { assembleHtml } from './assembler.js';
import type { LlmClient } from '../llm/client.js';
import type { AgentMessage, NewArtifact, OrchestratorEvent, Stage } from './types.js';

export interface RunInput {
  idea: string;
  ownerId?: string;
  /** 预创建的 projectId/runId（HTTP 层需先拿 runId 注册 SSE）；不传则内部创建 */
  projectId?: string;
  runId?: string;
}

export interface RunResult {
  runId: string;
  messages: AgentMessage[];
  artifact: NewArtifact;
  /** 流程是否完整跑完（被审批驳回则为 false） */
  completed: boolean;
}

interface OrchestratorDeps {
  llm: LlmClient;
  gate: ApprovalGate;
  checkpointer: Checkpointer;
  emit: (e: OrchestratorEvent) => void;
}

/** P5：单级驳回重跑上限，防无限重跑烧 token（review F-2）。 */
const MAX_STAGE_ITERATION = 5;

/**
 * 编排器：线性 Pipeline（PM→Architect→Engineer）+ 类型订阅驱动 + 逐级审批闸门 + 每步落库。
 * 接力由 watch 订阅涌现，而非硬编码调用链——新增角色只改 roles.ts。
 * P5：每级产出后过一道闸门；单向向前、批准即封存；驳回只带意见重跑本级，不回头、不级联下游。
 */
export class Orchestrator {
  private bus = new MessageBus();
  constructor(private deps: OrchestratorDeps) {}

  async runProject(input: RunInput): Promise<RunResult> {
    const { checkpointer, emit } = this.deps;

    // 落库：project + run（HTTP 层可预创建后传入 id，避免重复建）
    const projectId = input.projectId
      ?? (await checkpointer.ensureProject(input.ownerId ?? 'anon', input.idea.slice(0, 30), input.idea)).id;
    const runId = input.runId ?? (await checkpointer.ensureRun(projectId)).id;

    try {
      // 1) 广播用户需求（等价于 MetaGPT 发布 UserRequirement）
      await this.publishAndStore({
        runId, iteration: 1, role: 'coordinator', stage: 'requirement',
        content: input.idea, causeBy: 'RunRequirementAction',
      });

      // 2) 订阅驱动接力，每级一道闸门（单向向前）
      for (const role of ROLES) {
        const ok = await this.runRoleWithGate(role, input.idea, runId);
        if (!ok) {
          // 该级超过迭代上限仍被驳回：发终态 error（让 SSE 收尾）+ 标 failed（review R3/F-1/F-2）
          emit({ type: 'error', stage: role.action.stage, message: `该阶段修改超过 ${MAX_STAGE_ITERATION} 次仍未通过，已中止`, retryable: false });
          await checkpointer.setRunStatus(runId, 'failed', role.action.stage);
          return { runId, messages: [...this.bus.all()], artifact: emptyArtifact(), completed: false };
        }
      }

      // 3) 收尾：把各角色产物落成文件（pm→/pm、architect→/architect、engineer→/src 多文件），
      //    工程师多文件经组装器内联为单自包含 HTML 存 artifact（复用 iframe 预览）。
      const all = [...this.bus.all()];
      for (const role of ROLES) {
        const msg = all.filter((m) => m.stage === role.action.stage).pop(); // 该 stage 最新一版
        if (!msg) continue;
        const dir = role.name === 'pm' ? 'pm' : role.name === 'architect' ? 'architect' : 'src';
        const files = role.name === 'engineer'
          ? parseFiles(msg.content, 'src')
          : [{ path: `${dir}/${role.name === 'pm' ? 'spec' : 'arch'}.md`, content: msg.content }];
        const toSave = files.length ? files : [{ path: 'src/index.html', content: msg.content }];
        await checkpointer.saveFiles(runId, msg.iteration, role.name, role.action.stage, toSave);
      }

      // 组装预览 HTML：优先工程师多文件组装；组装的/单文件的统一过 ensureHtml
      // （提取/闭合校验/截断修复/兜底模板），保证预览永不为空且结构完整（review I-1）。
      const codeMsg = all.filter((m) => m.stage === 'code').pop();
      const parsed = parseFiles(codeMsg?.content ?? '', 'src');
      const assembled = parsed.length ? assembleHtml(parsed) : null;
      const artifact: NewArtifact = {
        kind: 'html',
        filename: 'index.html',
        content: injectStorageShim(ensureHtml(assembled ?? codeMsg?.content ?? '', input.idea)),
      };
      await checkpointer.saveArtifact(runId, artifact);
      await checkpointer.setRunStatus(runId, 'completed', 'code');
      emit({ type: 'run_done', runId, artifact });

      return { runId, messages: [...this.bus.all()], artifact, completed: true };
    } catch (err) {
      // 任何异常（LLM 失败等）：落 failed + error，不留 running（review F-1/F-7）
      console.error('[orchestrator] runProject failed:', err);
      await checkpointer.setRunStatus(runId, 'failed', null, String(err));
      throw err;
    }
  }

  /** 跑一级 + 过该级闸门：驳回带意见原地重跑本级（iteration+1）；批准返回 true；超上限返回 false。 */
  private async runRoleWithGate(role: Role, idea: string, runId: string): Promise<boolean> {
    const gate = role.action.stage;
    let iteration = 1;
    let feedback: string | null = null;

    for (;;) {
      await this.runRole(role, idea, runId, iteration, feedback);

      const summary = this.bus.contextFor([gate]).slice(0, 200);
      this.deps.emit({ type: 'approval_required', runId, gate, summary });
      await this.deps.checkpointer.setRunStatus(runId, 'awaiting_approval', gate);
      const decision = await this.deps.gate.wait(runId, gate);
      // 落库决策（批准/驳回各一行），沉淀为人类反馈驱动的决策日志
      await this.deps.checkpointer.recordApproval(runId, gate, decision.approved, decision.comment ?? null, iteration);

      if (decision.approved) {
        // 问题2：通过才落文件（被驳回的中间版不落盘）。每级通过分别落：pm→/pm、architect→/architect、engineer→/src。
        const msg = this.bus.latestOfStage(role.action.stage);
        if (msg) {
          const files = role.name === 'engineer'
            ? (parseFiles(msg.content, 'src').length ? parseFiles(msg.content, 'src') : [{ path: 'src/index.html', content: msg.content }])
            : [{ path: role.name === 'pm' ? 'pm/spec.md' : 'architect/arch.md', content: msg.content }];
          await this.deps.checkpointer.saveFiles(runId, msg.iteration, role.name, role.action.stage, files);
          this.deps.emit({ type: 'files_saved', runId, stage: role.action.stage });
        }
        await this.deps.checkpointer.setRunStatus(runId, 'running', gate);
        return true; // 批准：封存本级，进入下一级
      }
      // 驳回：带本轮意见原地重跑本级（单向，不动上下游）；超上限则中止该级
      if (iteration >= MAX_STAGE_ITERATION) return false;
      // review R5：重跑期间把状态拉回 running，避免 DB 停留 awaiting_approval 导致重放出假审批卡/决策 410
      await this.deps.checkpointer.setRunStatus(runId, 'running', gate);
      feedback = decision.comment ?? null;
      iteration += 1;
    }
  }

  private async runRole(
    role: Role, idea: string, runId: string, iteration: number, feedback: string | null,
  ): Promise<void> {
    const { llm, emit } = this.deps;
    emit({ type: 'stage_start', role: role.name, stage: role.action.stage, iteration });

    const upstream = this.bus.contextFor(role.upstreamStages);
    const content = await role.action.run({
      idea,
      upstream,
      feedback,
      llm,
      onToken: (delta) => emit({ type: 'token', role: role.name, stage: role.action.stage, delta }),
    });

    const message = await this.publishAndStore({
      runId, iteration, role: role.name, stage: role.action.stage,
      content, causeBy: role.action.name,
    });
    emit({ type: 'stage_done', message });

    // 问题2：工程师 code 一完成即组装+落 artifact + emit artifact_ready（预览立即可用，供审核评判；不等整 run 收尾）。
    // 预览永不为空：parseFiles 空→单文件 ensureHtml；assembleHtml null→ensureHtml 兜底（含空/截断修复）。
    if (role.name === 'engineer') {
      const parsed = parseFiles(message.content, 'src');
      const assembled = parsed.length ? assembleHtml(parsed) : null;
      const artifact: NewArtifact = {
        kind: 'html', filename: 'index.html',
        content: injectStorageShim(ensureHtml(assembled ?? message.content, idea)),
      };
      await this.deps.checkpointer.saveArtifact(runId, artifact);
      emit({ type: 'artifact_ready', runId, artifact });
    }
  }

  private async publishAndStore(input: {
    runId: string; iteration: number; role: string; stage: Stage; content: string; causeBy: string;
  }): Promise<AgentMessage> {
    const stored = await this.deps.checkpointer.appendMessage(input);
    this.bus.publish(stored);
    return stored;
  }
}

function emptyArtifact(): NewArtifact {
  return { kind: 'html', filename: 'index.html', content: '' };
}
