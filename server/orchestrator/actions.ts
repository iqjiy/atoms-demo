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
      // P5：驳回/迭代时把修改意见追加进 prompt，驱动本级按意见重跑
      const prompt = ctx.feedback?.trim()
        ? `${buildPrompt(ctx)}\n\n【修改意见】上一轮方案被驳回，请按以下意见修改：${ctx.feedback}`
        : buildPrompt(ctx);
      const runOnce = async () => {
        // 优先 token 级流式（DeepSeek 支持），逐字回调并累积；无 stream 则一次性 complete
        if (ctx.llm.stream) {
          let acc = '';
          for await (const delta of ctx.llm.stream({ system, prompt })) {
            acc += delta;
            ctx.onToken?.(delta);
          }
          return acc;
        }
        const content = await ctx.llm.complete({ system, prompt });
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

/** 多文件输出契约：路径行 + 围栏代码块，供 fileParser/assembler 解析组装（docu-system P0）。 */
const FILE_FORMAT_RULES = '\n\n【多文件输出】把代码拆成多个文件：每个文件前单独一行写相对路径（如 src/index.html、src/style.css、src/app.js），紧跟一个 ``` 代码块装该文件完整内容。index.html 用 <link rel="stylesheet" href="style.css"> 与 <script src="app.js"></script> 引用。必须输出完整文件，禁止省略占位。';

/** 各角色 system = 人设 + COMMON_RULES + COLLAB_IDENTITY（工程师另加 FILE_FORMAT_RULES）。导出供测试。 */
export const specSystem = '你是一名资深产品经理，把需求转化为清晰的产品规格。' + COMMON_RULES + COLLAB_IDENTITY;
export const architectureSystem = '你是一名系统架构师，为产品规格设计简洁可实现的前端架构。' + COMMON_RULES + COLLAB_IDENTITY;
export const codeSystem = '你是一名前端工程师，输出单文件 HTML（Tailwind CDN + 原生 JS），零外部依赖，以 <!DOCTYPE html> 开头、</html> 结尾。' + COMMON_RULES + COLLAB_IDENTITY + FILE_FORMAT_RULES;

export const specAction = makeLlmAction(
  'RunSpecAction',
  'spec',
  specSystem,
  (ctx) => `需求：${ctx.idea}\n\n${ctx.upstream}`,
);

export const architectureAction = makeLlmAction(
  'RunArchitectureAction',
  'architecture',
  architectureSystem,
  (ctx) => `需求：${ctx.idea}\n\n${ctx.upstream}`,
);

export const codeAction = makeLlmAction(
  'RunCodeAction',
  'code',
  codeSystem,
  (ctx) => `需求：${ctx.idea}\n\n${ctx.upstream}`,
);
