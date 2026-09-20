import { MessageBus } from './bus.js';
import { ROLES, type Role } from './roles.js';
import type { ApprovalGate } from './approvalGate.js';
import { Checkpointer } from './checkpointer.js';
import { ensureHtml, injectStorageShim } from './htmlGuard.js';
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

      // 3) 收尾：文件已在各级通过时落盘（T3），预览已在工程师 code 完成时落库（T2）。
      //    这里只发 run_done 兜底（带最新 artifact，供关页重放）。
      const artifact = (await checkpointer.latestArtifact(runId)) ?? emptyArtifact();
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
        // 问题6-T2：工程师落盘为单文件自包含 src/index.html（content=工程师原文），不再 parseFiles 拆分。
        const msg = this.bus.latestOfStage(role.action.stage);
        if (msg) {
          const files = role.name === 'engineer'
            ? [{ path: 'src/index.html', content: msg.content }]
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
      // 修改1B/2：驳回意见作为一等消息进流（渲染气泡 + 进被驳agent上下文），replyTo 指向被驳产物
      if (decision.comment?.trim()) {
        const rejected = this.bus.latestOfStage(gate); // 被驳那版（重跑前的最新；bus 已排除反馈）
        const fb = await this.deps.checkpointer.appendMessage({
          runId, iteration, role: 'reviewer', stage: gate,
          content: decision.comment.trim(), causeBy: 'ReviewFeedback', replyTo: rejected?.id ?? null,
        });
        this.bus.publish(fb); // 进 bus（contextFor/latestOfStage 已排除，不污染产物；供重放/补发携带）
        this.deps.emit({ type: 'stage_done', message: fb }); // 复用 stage_done 让前端出气泡（见 Task 5 渲染区分）
      }
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
    // 修改2 P-C：驳回轮带上被驳回那一版本级产物（latestOfStage 在本轮重跑前=被驳那版）
    const prevContent = feedback?.trim()
      ? this.bus.latestOfStage(role.action.stage)?.content ?? null
      : null;
    const content = await role.action.run({
      idea,
      upstream,
      feedback,
      prevContent,
      llm,
      onToken: (delta) => emit({ type: 'token', role: role.name, stage: role.action.stage, delta }),
    });

    const message = await this.publishAndStore({
      runId, iteration, role: role.name, stage: role.action.stage,
      content, causeBy: role.action.name,
    });
    emit({ type: 'stage_done', message });

    // 问题6-T2：工程师 code 一完成即落 artifact + emit artifact_ready（预览立即可用，供审核评判）。
    // 预览永可运行：直接用工程师单文件自包含原文，ensureHtml 提纯 + storage shim，不再 parseFiles/assembleHtml。
    if (role.name === 'engineer') {
      const html = ensureHtml(message.content, idea);
      const artifact: NewArtifact = {
        kind: 'html', filename: 'index.html',
        content: injectStorageShim(html),
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
