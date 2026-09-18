/**
 * LLM 产物后处理：剥离对话惯性语句。
 * 承接语以 markdown `> ` 引用块自然呈现（前端 markdown 渲染），无需单独拆分字段。
 */

/**
 * 剥离结尾的 LLM 对话惯性反问（如「需要我继续展开吗？」）。
 *
 * 策略（保守，宁可少删勿误删正文）：
 * - 只检查**最后一个非空行**；
 * - 仅当该行是「承接动词开头 + 以问号/句号收尾的纯客套反问」时才删除；
 * - 不以承接动词开头的行（无论是否含「吗？」「我可以」）一律视为正文保留。
 *
 * 这样：
 * - 「我可以分析两种场景：…」（陈述句，非承接反问）保留；
 * - 「这个权限我们应该校验吗？」（真实业务问句，非承接开头）保留；
 * - 「需要我继续吗？」（纯客套反问）删除。
 */
export function stripClosingQuestion(text: string): string {
  const lines = text.replace(/\s+$/, '').split('\n');
  // 定位最后一个非空行
  let i = lines.length - 1;
  while (i >= 0 && lines[i].trim() === '') i--;
  if (i < 0) return text;

  const last = lines[i].trim();
  if (isClosingBoilerplate(last)) {
    lines.splice(i, 1);
    return lines.join('\n').replace(/\s+$/, '');
  }
  return lines.join('\n');
}

/**
 * 判断是否为「纯客套反问收尾句」：
 * 必须以承接动词（需要我/要不要我/要我/需要我帮/我可以为你/需要我进一步）开头，
 * 且以「吗/么/呢」加问号（或句号）结尾——二者同时满足才删，避免误伤正文。
 */
function isClosingBoilerplate(line: string): boolean {
  const startsWithOffer = /^(需要我|要不要我|要我|我可以为你|需要我帮|是否要我)/.test(line);
  const isQuestionish = /[吗么呢]\s*[？?。]\s*$/.test(line);
  return startsWithOffer && isQuestionish;
}
