import { describe, it, expect } from 'vitest';
import { stripClosingQuestion, splitAckAndBody } from '../../../server/orchestrator/postprocess.js';

describe('stripClosingQuestion 剥离 LLM 对话惯性反问尾巴', () => {
  it('剥离结尾的“需要我…吗”反问', () => {
    const body = '# PRD\n\n内容。\n\n需要我继续展开具体代码骨架吗？';
    expect(stripClosingQuestion(body)).toBe('# PRD\n\n内容。');
  });

  it('剥离“是否需要我进一步…”类尾巴', () => {
    const body = '设计如上。\n\n需要我针对某个模块进一步展开吗？';
    expect(stripClosingQuestion(body)).toBe('设计如上。');
  });

  it('无反问尾巴时原样返回', () => {
    const body = '# 规格\n\n纯内容，无反问。';
    expect(stripClosingQuestion(body)).toBe(body);
  });
});

describe('splitAckAndBody 拆分承接语与正式产物', () => {
  it('以 `---` 分隔：前段为承接语，后段为正式产物', () => {
    const out = '> 我看了 PRD，核心是扫雷。\n\n---\n\n# 架构设计\n\n内容';
    const { ack, body } = splitAckAndBody(out);
    expect(ack).toContain('我看了 PRD');
    expect(body).toContain('# 架构设计');
    expect(body).not.toContain('我看了 PRD');
  });

  it('无分隔符时：ack 为空，整体作为 body', () => {
    const out = '# 架构设计\n\n内容';
    const { ack, body } = splitAckAndBody(out);
    expect(ack).toBe('');
    expect(body).toBe(out);
  });
});
