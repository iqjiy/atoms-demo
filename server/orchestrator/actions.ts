import type { LlmClient } from '../llm/client.js';
import type { Stage } from '../../shared-types/index.js';
import { stripClosingQuestion } from './postprocess.js';

/** Action 调用上下文（由 runner 提供）。 */
export interface ActionContext {
  idea: string;
  /** contextFor 裁剪后的上游产物 */
  upstream: string;
  llm: LlmClient;
  /** P5：驳回/迭代的修改意见，注入本级重跑 prompt */
  feedback?: string | null;
  /** 修改2 P-C：驳回轮携带——被驳回那一版本级产物（供修订参照） */
  prevContent?: string | null;
  /** token 级回调（P2 Fake 直接一次性给，P3 真实流式） */
  onToken?: (delta: string) => void;
}

/** 最小可执行单元（复刻 MetaGPT Action）。 */
export interface Action {
  readonly name: string;
  readonly stage: Stage;
  run(ctx: ActionContext): Promise<string>;
}

/** 修订纪律（修改2 P-C）：驳回轮专用 system 增量——无承接模板、直接针对修改意见修订。 */
const REVISE_RULES = '\n\n【修订要求】你上一轮的产物被驳回。直接针对修改意见修订：逐条响应意见、保留其余已通过部分，输出修订后的完整产物。不客套寒暄、不复述上游、不以助手口吻结尾。';

function makeLlmAction(name: string, stage: Stage, system: string, reviseSystem: string, buildPrompt: (ctx: ActionContext) => string): Action {
  return {
    name,
    stage,
    async run(ctx) {
      // 修改2 P-C：驳回轮用专用 system（修订要求、无承接模板）+ prompt 含上一轮产物与修改意见
      const rejected = !!ctx.feedback?.trim();
      const usedSystem = rejected ? reviseSystem : system;
      const prompt = rejected
        ? `${buildPrompt(ctx)}\n\n【你上一轮的产物】${ctx.prevContent ?? ''}\n\n【审核修改意见】${ctx.feedback}`
        : buildPrompt(ctx);
      const runOnce = async () => {
        // 优先 token 级流式（DeepSeek 支持），逐字回调并累积；无 stream 则一次性 complete
        if (ctx.llm.stream) {
          let acc = '';
          for await (const delta of ctx.llm.stream({ system: usedSystem, prompt })) {
            acc += delta;
            ctx.onToken?.(delta);
          }
          return acc;
        }
        const content = await ctx.llm.complete({ system: usedSystem, prompt });
        ctx.onToken?.(content);
        return content;
      };
      // 剥离对话惯性反问尾巴（“需要我…吗”等），产物才干净
      return stripClosingQuestion(await runOnce());
    },
  };
}

/** 协作身份（修改2 P-A）：让每个 agent 知道自己在 PM→架构师→工程师流水线中的位置，避免单次问答腔。 */
const COLLAB_IDENTITY = '\n\n【你的工作背景】你是一个「想法→应用」多 agent 协作流水线中的一员（产品经理→架构师→前端工程师），不是一次性问答助手。你的产物会被下游角色直接接续使用，并由人类逐级审核（通过/驳回重做）。因此：直接产出供下游使用的正式产物，面向任务与下游读者写作；不客套寒暄、不复述上游内容、不以助手口吻结尾（如"需要我…吗""希望对你有帮助"）。若需衔接上游，一句话点出关键衔接点、融合进正文即可，不写"我读到了…"式的客套引用块。';

/** 产物纪律（保留）：不反问、Markdown。 */
const COMMON_RULES = '\n\n【输出要求】只输出正式产物本身（Markdown 格式），不客套、结尾不反问。';

/** 输出契约（docu-problem6）：只产出一个自包含 index.html（弃多文件双份契约，避免 LLM 写两遍致截断）。禁 ES module。 */
const FILE_FORMAT_RULES = '\n\n【输出契约】只输出一个自包含的 index.html：所有 CSS 内联在 <style> 标签里、所有 JS 内联在 <script> 标签里，不引用任何其它本地文件（禁止 <link rel="stylesheet" href="...">、禁止 <script src="..."> 引用本地文件），以 <!DOCTYPE html> 开头、</html> 结尾。必须输出完整可运行代码，禁止省略/截断/占位。禁止使用 ES module（不要写 import/export，不要把 script 标成 type="module"）。';

/** 各角色人设（驳回轮 system 复用此身份，去掉协作身份/承接模板）。 */
const SPEC_PERSONA = '你是一名资深产品经理，把需求转化为清晰的产品规格。';
const ARCH_PERSONA = '你是一名系统架构师，为产品规格设计简洁可实现的前端架构。';
const CODE_PERSONA = '你是一名前端工程师，输出单文件 HTML（Tailwind CDN + 原生 JS），零外部依赖，以 <!DOCTYPE html> 开头、</html> 结尾。';

/** 各角色 system = 人设 + COMMON_RULES + COLLAB_IDENTITY（工程师另加 FILE_FORMAT_RULES）。导出供测试。 */
export const specSystem = SPEC_PERSONA + COMMON_RULES + COLLAB_IDENTITY;
export const architectureSystem = ARCH_PERSONA + COMMON_RULES + COLLAB_IDENTITY;
export const codeSystem = CODE_PERSONA + COMMON_RULES + COLLAB_IDENTITY + FILE_FORMAT_RULES;

/** 驳回轮 system = 人设 + COMMON_RULES + REVISE_RULES（无 COLLAB_IDENTITY/承接模板）。 */
const specReviseSystem = SPEC_PERSONA + COMMON_RULES + REVISE_RULES;
const architectureReviseSystem = ARCH_PERSONA + COMMON_RULES + REVISE_RULES;
const codeReviseSystem = CODE_PERSONA + COMMON_RULES + REVISE_RULES + FILE_FORMAT_RULES;

export const specAction = makeLlmAction(
  'RunSpecAction',
  'spec',
  specSystem,
  specReviseSystem,
  (ctx) => `需求：${ctx.idea}\n\n${ctx.upstream}`,
);

export const architectureAction = makeLlmAction(
  'RunArchitectureAction',
  'architecture',
  architectureSystem,
  architectureReviseSystem,
  (ctx) => `需求：${ctx.idea}\n\n${ctx.upstream}`,
);

export const codeAction = makeLlmAction(
  'RunCodeAction',
  'code',
  codeSystem,
  codeReviseSystem,
  (ctx) => `需求：${ctx.idea}\n\n${ctx.upstream}`,
);
