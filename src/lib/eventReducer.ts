import type { OrchestratorEvent, Stage } from '../../server/orchestrator/types.js';

export type StageStatus = 'running' | 'done' | 'error';

export interface StageState {
  role: string;
  stage: Stage;
  status: StageStatus;
  text: string;
}

export interface TimelineState {
  stages: StageState[];
  done: boolean;
  error: string | null;
  artifact: { kind: string; filename: string; content: string } | null;
  awaitingApproval: boolean;
}

export function initialState(): TimelineState {
  return { stages: [], done: false, error: null, artifact: null, awaitingApproval: false };
}

/** 把编排事件归约为 UI 状态（纯函数，便于单测）。 */
export function reduceEvent(state: TimelineState, e: OrchestratorEvent): TimelineState {
  switch (e.type) {
    case 'stage_start': {
      // 幂等：同阶段已存在则更新为 running，否则追加
      const existing = state.stages.findIndex((s) => s.stage === e.stage);
      const next: StageState = { role: e.role, stage: e.stage, status: 'running', text: '' };
      const stages = existing >= 0
        ? state.stages.map((s, i) => (i === existing ? { ...s, status: 'running' as const } : s))
        : [...state.stages, next];
      return { ...state, stages };
    }
    case 'token': {
      const stages = state.stages.map((s) =>
        s.stage === e.stage ? { ...s, text: s.text + e.delta } : s,
      );
      return { ...state, stages };
    }
    case 'stage_done': {
      // F-03：用剥离/提纯后的最终内容替换流式累积文本，使 UI 与落库一致
      const stages = state.stages.map((s) =>
        s.stage === e.message.stage
          ? { ...s, status: 'done' as const, text: e.message.content }
          : s,
      );
      return { ...state, stages };
    }
    case 'approval_required':
      return { ...state, awaitingApproval: true };
    case 'run_done':
      return { ...state, done: true, awaitingApproval: false, artifact: e.artifact };
    case 'error': {
      const stages = state.stages.map((s) =>
        s.stage === e.stage ? { ...s, status: 'error' as const } : s,
      );
      return { ...state, stages, error: e.message, awaitingApproval: false };
    }
    default:
      return state;
  }
}
