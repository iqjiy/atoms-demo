import type { ActionName, AgentRole } from './types.js';
import type { Stage } from '../../shared-types/index.js';
import type { Action } from './actions.js';
import { specAction, architectureAction, codeAction } from './actions.js';

/** 角色定义：name + 人设 + 装备 Action + watch 订阅（复刻 MetaGPT Role）。 */
export interface Role {
  name: AgentRole;
  profile: string;
  action: Action;
  /** 订阅：关心哪个上游 Action 的产出 */
  watch: ActionName;
  /** 该角色依赖的上游阶段（contextFor 用） */
  upstreamStages: Stage[];
}

export const ROLES: Role[] = [
  {
    name: 'pm',
    profile: '产品经理',
    action: specAction,
    watch: 'RunRequirementAction',
    upstreamStages: ['requirement'],
  },
  {
    name: 'architect',
    profile: '架构师',
    action: architectureAction,
    watch: 'RunSpecAction',
    upstreamStages: ['requirement', 'spec'],
  },
  {
    name: 'engineer',
    profile: '工程师',
    action: codeAction,
    watch: 'RunArchitectureAction',
    upstreamStages: ['requirement', 'spec', 'architecture'],
  },
];
