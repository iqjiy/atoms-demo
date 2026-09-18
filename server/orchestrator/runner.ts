import { MessageBus } from './bus.js';
import { ROLES, type Role } from './roles.js';
import type { ApprovalGate } from './approvalGate.js';
import { Checkpointer } from './checkpointer.js';
import { ensureHtml } from './htmlGuard.js';
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

/**
 * 编排器：线性 Pipeline（PM→Architect→Engineer）+ 类型订阅驱动 + 审批闸门 + 每步落库。
 * 接力由 watch 订阅涌现，而非硬编码调用链——新增角色只改 roles.ts。
 */
export class Orchestrator {
  private bus = new MessageBus();
  constructor(private deps: OrchestratorDeps) {}

  async runProject(input: RunInput): Promise<RunResult> {
    const { checkpointer, emit } = this.deps;
    const iteration = 1;

    // 落库：project + run（HTTP 层可预创建后传入 id，避免重复建）
    const projectId = input.projectId
      ?? (await checkpointer.ensureProject(input.ownerId ?? 'anon', input.idea.slice(0, 30), input.idea)).id;
    const runId = input.runId ?? (await checkpointer.ensureRun(projectId)).id;

    // 1) 广播用户需求（等价于 MetaGPT 发布 UserRequirement）
    await this.publishAndStore({
      runId, iteration, role: 'coordinator', stage: 'requirement',
      content: input.idea, causeBy: 'RunRequirementAction',
    });

    // 2) 订阅驱动接力
    for (const role of ROLES) {
      await this.runRole(role, input.idea, runId, iteration);

      // 3) 人在回路：架构师产出后过审批闸门（P2 默认自动通过）
      if (role.name === 'architect') {
        const summary = this.bus.contextFor(['architecture']).slice(0, 200);
        emit({ type: 'approval_required', runId, gate: 'architecture', summary });
        const approved = await this.deps.gate.wait(runId, 'architecture');
        if (!approved) {
          emit({ type: 'error', stage: 'architecture', message: '用户驳回架构方案', retryable: true });
          return { runId, messages: [...this.bus.all()], artifact: emptyArtifact(), completed: false };
        }
      }
    }

    // 4) 收尾：取 code 阶段产物，经 htmlGuard 提纯（R3）后作为最终 Artifact 落库
    const codeMsg = [...this.bus.all()].reverse().find((m) => m.stage === 'code');
    const artifact: NewArtifact = {
      kind: 'html',
      filename: 'index.html',
      content: ensureHtml(codeMsg?.content ?? '', input.idea),
    };
    await checkpointer.saveArtifact(runId, artifact);
    emit({ type: 'run_done', runId, artifact });

    return { runId, messages: [...this.bus.all()], artifact, completed: true };
  }

  private async runRole(role: Role, idea: string, runId: string, iteration: number): Promise<void> {
    const { llm, emit } = this.deps;
    emit({ type: 'stage_start', role: role.name, stage: role.action.stage, iteration });

    const upstream = this.bus.contextFor(role.upstreamStages);
    const content = await role.action.run({
      idea,
      upstream,
      llm,
      onToken: (delta) => emit({ type: 'token', role: role.name, stage: role.action.stage, delta }),
    });

    const message = await this.publishAndStore({
      runId, iteration, role: role.name, stage: role.action.stage,
      content, causeBy: role.action.name,
    });
    emit({ type: 'stage_done', message });
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
