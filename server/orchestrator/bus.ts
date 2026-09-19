import type { AgentMessage, Stage } from '../../shared-types/index.js';
import type { ActionName } from './types.js';

type Handler = (m: AgentMessage) => void;

/**
 * 消息总线：复刻 MetaGPT 的「cause_by + _watch 类型订阅」路由。
 * 发布方无需关心谁接收；订阅方声明关心的 ActionName，命中即唤醒。
 * 新增角色只需加一条 watch，主流程零改动。
 */
export class MessageBus {
  private messages: AgentMessage[] = [];
  private subscriptions = new Map<ActionName, Set<Handler>>();

  /** 发布消息：命中订阅该 causeBy 的所有 handler。 */
  publish(msg: AgentMessage): void {
    this.messages.push(msg);
    for (const cb of this.subscriptions.get(msg.causeBy as ActionName) ?? []) {
      cb(msg);
    }
  }

  /** 订阅：声明关心哪些 Action 产出的消息（复刻 Role._watch）。 */
  watch(actionNames: ActionName[], cb: Handler): void {
    for (const n of actionNames) {
      if (!this.subscriptions.has(n)) this.subscriptions.set(n, new Set());
      this.subscriptions.get(n)!.add(cb);
    }
  }

  /**
   * 上下文裁剪：只把指定上游阶段的产物喂给下游，防 token 膨胀。
   * 同一阶段若因驳回/迭代重跑而有多版，只取**最新一版**（避免新旧并存喂给下游造成矛盾）。
   */
  contextFor(stages: Stage[]): string {
    const latestByStage = new Map<Stage, AgentMessage>();
    for (const m of this.messages) {
      if (stages.includes(m.stage)) latestByStage.set(m.stage, m); // 后发布覆盖先发布 = 取最新
    }
    // 按传入 stages 顺序输出，保证上游在前的稳定阅读顺序
    return stages
      .map((s) => latestByStage.get(s))
      .filter((m): m is AgentMessage => Boolean(m))
      .map((m) => `## [${m.role}/${m.stage}]\n${m.content}`)
      .join('\n\n');
  }

  /** 只读访问已发布消息（runner 收尾取产物用）。 */
  all(): readonly AgentMessage[] {
    return this.messages;
  }
}
