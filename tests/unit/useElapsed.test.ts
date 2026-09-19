import { describe, it, expect } from 'vitest';
import { formatElapsed } from '../../src/hooks/useElapsed.js';

describe('formatElapsed：mm:ss 格式化', () => {
  it('0ms → 00:00', () => {
    expect(formatElapsed(0)).toBe('00:00');
  });

  it('59s → 00:59', () => {
    expect(formatElapsed(59_000)).toBe('00:59');
  });

  it('60s → 01:00', () => {
    expect(formatElapsed(60_000)).toBe('01:00');
  });

  it('90.5s → 01:30（向下取整）', () => {
    expect(formatElapsed(90_500)).toBe('01:30');
  });

  it('10 分钟 → 10:00', () => {
    expect(formatElapsed(600_000)).toBe('10:00');
  });

  it('负数钳到 00:00（时钟漂移兜底）', () => {
    expect(formatElapsed(-5000)).toBe('00:00');
  });
});
