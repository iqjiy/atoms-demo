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

/** 通用约束：禁止对话惯性反问，产物用 Markdown。 */
const COMMON_RULES = '\n\n【输出要求】只输出正式产物本身（Markdown 格式）。不要以“好的”“当然可以”开头，结尾不要问“需要我…吗”之类的话。';

/** 承接语要求：先口语化承接上游（引用块），再展开正式产物。 */
const ACK_RULES = '\n\n【协作要求】先用 1-2 句口语化的话承接上游产物（说明你读到了什么、抓住的核心点、要注意的风险），以 `> ` 引用块呈现；空一行后再展开你的正式产物。';

/** 多文件输出契约：路径行 + 围栏代码块，供 fileParser/assembler 解析组装（docu-system P0）。 */
const FILE_FORMAT_RULES = '\n\n【多文件输出】把代码拆成多个文件：每个文件前单独一行写相对路径（如 src/index.html、src/style.css、src/app.js），紧跟一个 ``` 代码块装该文件完整内容。index.html 用 <link rel="stylesheet" href="style.css"> 与 <script src="app.js"></script> 引用。必须输出完整文件，禁止省略占位。';

export const specAction = makeLlmAction(
  'RunSpecAction',
  'spec',
  '你是一名资深产品经理，把需求转化为清晰的产品规格。' + COMMON_RULES,
  (ctx) => `需求：${ctx.idea}\n\n${ctx.upstream}`,
);

export const architectureAction = makeLlmAction(
  'RunArchitectureAction',
  'architecture',
  '你是一名系统架构师，为产品规格设计简洁可实现的前端架构。' + COMMON_RULES + ACK_RULES,
  (ctx) => `需求：${ctx.idea}\n\n${ctx.upstream}`,
);

export const codeAction = makeLlmAction(
  'RunCodeAction',
  'code',
  '你是一名前端工程师，输出单文件 HTML（Tailwind CDN + 原生 JS），零外部依赖，以 <!DOCTYPE html> 开头、</html> 结尾。' + COMMON_RULES + ACK_RULES + FILE_FORMAT_RULES,
  (ctx) => `需求：${ctx.idea}\n\n${ctx.upstream}`,
);
