import { describe, it, expect } from 'vitest';
import { canConfirmReject, approveNeedsPreviewConfirm } from '../../src/components/chat/ApprovalCard.js';

describe('ApprovalCard · canConfirmReject（方案a：驳回必填意见）', () => {
  it('空字符串 → false', () => {
    expect(canConfirmReject('')).toBe(false);
  });

  it('纯空白 → false', () => {
    expect(canConfirmReject('   \n\t  ')).toBe(false);
  });

  it('有内容 → true', () => {
    expect(canConfirmReject('请补充单元测试')).toBe(true);
  });

  it('前后空白包裹的内容 → true', () => {
    expect(canConfirmReject('  重写这一节  ')).toBe(true);
  });
});

describe('ApprovalCard · approveNeedsPreviewConfirm（code 关通过需先确认已试玩）', () => {
  it('code 关（最后一道）→ true：点通过先弹确认', () => {
    expect(approveNeedsPreviewConfirm('code')).toBe(true);
  });

  it('前两关不受影响 → false：点通过直接放行', () => {
    expect(approveNeedsPreviewConfirm('spec')).toBe(false);
    expect(approveNeedsPreviewConfirm('architecture')).toBe(false);
  });
});
