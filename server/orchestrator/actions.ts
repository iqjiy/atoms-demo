import type { LlmClient } from '../llm/client.js';
import type { Stage } from '../../shared-types/index.js';

/** Action 调用上下文（由 runner 提供）。 */
export interface ActionContext {
  idea: string;
  /** contextFor 裁剪后的上游产物 */
  upstream: string;
  llm: LlmClient;
  /** token 级回调（P2 Fake 直接一次性给，P3 真实流式） */
  onToken?: (delta: string) => void;
}

/** 最小可执行单元（复刻 MetaGPT Action）。 */
export interface Action {
  readonly name: string;
  readonly stage: Stage;
  run(ctx: ActionContext): Promise<string>;
}

function makeLlmAction(name: string, stage: Stage, system: string, buildPrompt: (ctx: ActionContext) => string): Action {
  return {
    name,
    stage,
    async run(ctx) {
      // 优先 token 级流式（DeepSeek 支持），逐字回调并累积；无 stream 则一次性 complete
      if (ctx.llm.stream) {
        let acc = '';
        for await (const delta of ctx.llm.stream({ system, prompt: buildPrompt(ctx) })) {
          acc += delta;
          ctx.onToken?.(delta);
        }
        return acc;
      }
      const content = await ctx.llm.complete({ system, prompt: buildPrompt(ctx) });
      ctx.onToken?.(content);
      return content;
    },
  };
}

export const specAction = makeLlmAction(
  'RunSpecAction',
  'spec',
  '你是一名资深产品经理，把需求转化为清晰的产品规格。',
  (ctx) => `需求：${ctx.idea}\n\n${ctx.upstream}`,
);

export const architectureAction = makeLlmAction(
  'RunArchitectureAction',
  'architecture',
  '你是一名系统架构师，为产品规格设计简洁可实现的前端架构。',
  (ctx) => `需求：${ctx.idea}\n\n${ctx.upstream}`,
);

export const codeAction = makeLlmAction(
  'RunCodeAction',
  'code',
  '你是一名前端工程师，输出单文件 HTML（Tailwind CDN + 原生 JS），零外部依赖，以 <!DOCTYPE html> 开头、</html> 结尾。',
  (ctx) => `需求：${ctx.idea}\n\n${ctx.upstream}`,
);
