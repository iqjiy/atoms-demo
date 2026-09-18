import { describe, it, expect } from 'vitest';
import { RunManager } from '../../../server/orchestrator/runManager.js';
import type { OrchestratorEvent } from '../../../server/orchestrator/types.js';

const ev = (type: OrchestratorEvent['type']): OrchestratorEvent =>
  ({ type, runId: 'r1' } as OrchestratorEvent);

describe('RunManager 进程内运行管理', () => {
  it('register 后可 subscribe，emit 广播给该 runId 的所有订阅者', () => {
    const rm = new RunManager();
    rm.register('r1');
    const a: string[] = [];
    const b: string[] = [];
    rm.subscribe('r1', (e) => a.push(e.type));
    rm.subscribe('r1', (e) => b.push(e.type));

    rm.emit('r1', ev('stage_start'));
    rm.emit('r1', ev('run_done'));

    expect(a).toEqual(['stage_start', 'run_done']);
    expect(b).toEqual(['stage_start', 'run_done']);
  });

  it('unsubscribe 后不再收到事件', () => {
    const rm = new RunManager();
    rm.register('r1');
    const a: string[] = [];
    const unsub = rm.subscribe('r1', (e) => a.push(e.type));
    rm.emit('r1', ev('stage_start'));
    unsub();
    rm.emit('r1', ev('run_done'));
    expect(a).toEqual(['stage_start']);
  });

  it('对已结束的 runId subscribe 返回 null（表示应走历史回放）', () => {
    const rm = new RunManager();
    rm.register('r1');
    rm.finish('r1');
    expect(rm.subscribe('r1', () => {})).toBeNull();
  });

  it('对不存在的 runId emit 不抛错（防御）', () => {
    const rm = new RunManager();
    expect(() => rm.emit('nope', ev('stage_start'))).not.toThrow();
  });

  it('isActive 反映运行状态', () => {
    const rm = new RunManager();
    rm.register('r1');
    expect(rm.isActive('r1')).toBe(true);
    rm.finish('r1');
    expect(rm.isActive('r1')).toBe(false);
  });
});
