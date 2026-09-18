import { describe, it, expect } from 'vitest';
import { stripClosingQuestion } from '../../../server/orchestrator/postprocess.js';

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

  it('不误删含关键字的正常内容行（F-02）', () => {
    // 整行是正常内容，仅含“我可以”等子串，不应被删
    const body = '# 分析\n\n我可以分析两种场景：一是 A，二是 B。\n这是正文结尾。';
    expect(stripClosingQuestion(body)).toBe(body);
  });

  it('不误删标题里的关键字（F-02）', () => {
    const body = '内容。\n\n# 是否需要鉴权';
    expect(stripClosingQuestion(body)).toBe(body);
  });
});
