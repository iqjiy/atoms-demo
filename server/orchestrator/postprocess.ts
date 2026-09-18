/**
 * LLM 产物后处理：剥离对话惯性语句、拆分承接语与正式产物。
 */

/** 剥离结尾的 LLM 对话惯性反问（“需要我…吗”“是否需要我…”等）。 */
export function stripClosingQuestion(text: string): string {
  const lines = text.replace(/\s+$/, '').split('\n');
  // 从末尾去掉空行与反问/承接性结尾句
  while (lines.length > 0) {
    const last = lines[lines.length - 1].trim();
    if (last === '') {
      lines.pop();
      continue;
    }
    // 匹配“需要我…”“要不要我…”“我可以继续…”“希望对你有帮助”等收尾
    if (/(需要我|要不要我|我可以|是否能够|是否需要|希望对你|希望对您|如果你需要|如需要)/.test(last)) {
      lines.pop();
      continue;
    }
    break;
  }
  return lines.join('\n');
}

export interface AckAndBody {
  /** 承接语（口语化承接上游，引用块） */
  ack: string;
  /** 正式产物 */
  body: string;
}

/**
 * 拆分「承接语 + 正式产物」。约定：Agent 先输出承接语（`> `引用块），
 * 用一行 `---` 分隔，之后是正式产物。无分隔符则整体视为产物。
 */
export function splitAckAndBody(text: string): AckAndBody {
  const idx = text.search(/^\s*---+\s*$/m);
  if (idx < 0) return { ack: '', body: text };
  const ack = text.slice(0, idx).trim();
  const rest = text.slice(idx);
  const body = rest.replace(/^\s*---+\s*/, '').trim();
  return { ack, body };
}
