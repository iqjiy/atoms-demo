import { Orchestrator } from './runner.js';
import { FakeLlmClient } from '../llm/fakeClient.js';
import { AutoApproveGate } from './approvalGate.js';
import { Checkpointer } from './checkpointer.js';
import { createInMemoryRepos } from '../db/repositories/memory.js';
import type { OrchestratorEvent } from './types.js';

/**
 * CLI：跑通一次完整三阶段生成（P2 验收 AC-P2-6）。
 * 用法：npx tsx server/orchestrator/cli.ts "做一个待办应用"
 */
async function main() {
  const idea = process.argv[2];
  if (!idea) {
    console.error('用法: npx tsx server/orchestrator/cli.ts "<需求>"');
    process.exit(1);
  }

  const repos = createInMemoryRepos();
  const orc = new Orchestrator({
    llm: new FakeLlmClient(),
    gate: new AutoApproveGate(),
    checkpointer: new Checkpointer(repos),
    emit: (e: OrchestratorEvent) => {
      if (e.type === 'stage_start') console.log(`\n▶ [${e.role}] 开始 ${e.stage} 阶段`);
      if (e.type === 'stage_done') console.log(`✔ [${e.message.role}] ${e.message.stage} 完成（${e.message.content.length} 字）`);
      if (e.type === 'approval_required') console.log(`⏸  审批闸门: ${e.gate}（P2 自动通过）`);
      if (e.type === 'error') console.log(`✘ 错误: ${e.message}`);
    },
  });

  const result = await orc.runProject({ idea });

  console.log('\n========== 接力完成 ==========');
  console.log('runId:', result.runId);
  console.log('阶段序列:', result.messages.map((m) => m.stage).join(' → '));
  console.log('completed:', result.completed);
  console.log('\n----- 生成的 HTML artifact（前 400 字）-----');
  console.log(result.artifact.content.slice(0, 400));
  console.log('\n----- 落库校验 -----');
  const msgs = await repos.messages.listByRun(result.runId);
  const art = await repos.artifacts.latestByRun(result.runId);
  console.log(`messages 落库 ${msgs.length} 条；artifact version=${art?.version}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
