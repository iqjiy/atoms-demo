/**
 * LLM 产物后处理：剥离对话惯性语句。
 * 承接语以 markdown `> ` 引用块自然呈现（前端 markdown 渲染），无需单独拆分字段。
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
    if (isClosingBoilerplate(last)) {
      lines.pop();
      continue;
    }
    break;
  }
  return lines.join('\n');
}

/**
 * 判断某行是否为「对话惯性收尾句」——整行就是客套/反问，而非含关键字的正文。
 * 收紧规则（F-02）：标题（# 开头）与列表/正文行一律不删。
 * 仅匹配以「需要我/要不要我/我可以继续/是否需要/如需/希望对你」等开头、
 * 或整行以「吗？」「么？」收尾且主语是「我」的短句。
 */
function isClosingBoilerplate(line: string): boolean {
  // 标题、列表项、代码 fence 一律视为正文
  if (/^(#|[-*]|\d+\.|`|>)/.test(line)) return false;
  // 以承接/客套动词开头的整行
  if (/^(需要我|要不要我|我可以|是否需要|如果你需要|如需要|如需|希望对你|希望对您|若需要)/.test(line)) return true;
  // 整行是以「吗/么」结尾的反问且含「我」（如“要我继续吗？”）
  if (/[吗么]\s*[？?]\s*$/.test(line) && /我/.test(line) && line.length <= 40) return true;
  return false;
}
