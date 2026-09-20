import { describe, it, expect } from 'vitest';
import { DEFAULT_AGENT_CHAIN } from '../../src/components/config/AgentConfigModal.js';

describe('AgentConfigModal · DEFAULT_AGENT_CHAIN（默认链路）', () => {
  it('是 PM → Architect → Code 三级，顺序即执行序', () => {
    expect(DEFAULT_AGENT_CHAIN.map((n) => n.name)).toEqual(['PM', 'Architect', 'Code']);
  });

  it('每个节点有 stage 与 profile，供卡片展示', () => {
    for (const n of DEFAULT_AGENT_CHAIN) {
      expect(n.stage).toBeTruthy();
      expect(n.profile).toBeTruthy();
    }
  });

  it('末级是产物节点 code', () => {
    expect(DEFAULT_AGENT_CHAIN[DEFAULT_AGENT_CHAIN.length - 1].stage).toBe('code');
  });
});
