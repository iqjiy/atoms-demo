import { describe, it, expect } from 'vitest';
import { Orchestrator } from '../../../server/orchestrator/runner.js';
import { FakeLlmClient } from '../../../server/llm/fakeClient.js';
import { AutoApproveGate } from '../../../server/orchestrator/approvalGate.js';
import { Checkpointer } from '../../../server/orchestrator/checkpointer.js';
import { createInMemoryRepos } from '../../../server/db/repositories/memory.js';
import type { OrchestratorEvent } from '../../../server/orchestrator/types.js';

function setup() {
  const repos = createInMemoryRepos();
  const events: OrchestratorEvent[] = [];
  return { repos, events };
}

describe('Orchestrator 三阶段接力', () => {
  it('按 requirement→spec→architecture→code 顺序产出消息', async () => {
    const { repos, events } = setup();
    const orc = new Orchestrator({
      llm: new FakeLlmClient(),
      gate: new AutoApproveGate(),
      checkpointer: new Checkpointer(repos),
      emit: (e) => events.push(e),
    });
    const result = await orc.runProject({ idea: '做一个待办应用' });

    const stages = result.messages.map((m) => m.stage);
    expect(stages).toEqual(['requirement', 'spec', 'architecture', 'code']);
  });

  it('事件流包含 stage_start→stage_done 与 run_done，顺序正确', async () => {
    const { repos, events } = setup();
    const orc = new Orchestrator({
      llm: new FakeLlmClient(),
      gate: new AutoApproveGate(),
      checkpointer: new Checkpointer(repos),
      emit: (e) => events.push(e),
    });
    await orc.runProject({ idea: 'x' });

    const types = events.map((e) => e.type);
    expect(types[0]).toBe('stage_start');
    expect(types).toContain('stage_done');
    expect(types[types.length - 1]).toBe('run_done');
  });

  it('最终产出 HTML artifact 并落库，可读回', async () => {
    const { repos } = setup();
    const orc = new Orchestrator({
      llm: new FakeLlmClient(),
      gate: new AutoApproveGate(),
      checkpointer: new Checkpointer(repos),
      emit: () => {},
    });
    const result = await orc.runProject({ idea: '做一个待办应用' });

    expect(result.artifact.kind).toBe('html');
    expect(result.artifact.content).toContain('<');
    // 落库可读回
    const msgs = await repos.messages.listByRun(result.runId);
    expect(msgs.length).toBeGreaterThanOrEqual(4);
    const art = await repos.artifacts.latestByRun(result.runId);
    expect(art?.content).toBe(result.artifact.content);
  });

  it('驳回即本级重跑：持续驳回 PM 会反复重跑 spec 而不前进（有界验证）', async () => {
    const { repos } = setup();
    // 前 2 次驳回、第 3 次批准 spec，之后一路批准
    const decisions = [
      { approved: false, comment: '重做' },
      { approved: false, comment: '再做' },
      { approved: true },
      { approved: true },
      { approved: true },
    ];
    let i = 0;
    const gate = { wait: async () => decisions[Math.min(i++, decisions.length - 1)] };
    const orc = new Orchestrator({
      llm: new FakeLlmClient(),
      gate,
      checkpointer: new Checkpointer(repos),
      emit: () => {},
    });
    const result = await orc.runProject({ idea: 'x' });

    const msgs = await repos.messages.listByRun(result.runId);
    // 驳回意见是旁白非产物（修改1B/2 ReviewFeedback），此处按产物统计
    const count = (s: string) => msgs.filter((m) => m.stage === s && m.causeBy !== 'ReviewFeedback').length;
    // spec 被驳回 2 次后第 3 次批准 → 共跑 3 次；下游各 1 次
    expect(count('spec')).toBe(3);
    expect(count('architecture')).toBe(1);
    expect(count('code')).toBe(1);
    expect(result.completed).toBe(true);
  });

  it('工程师输出带 markdown 包裹时，落库 artifact 被提纯为纯 HTML（R3）', async () => {
    const { repos } = setup();
    // 模拟真实 LLM：工程师输出带说明前缀 + ```html 包裹
    const messyLlm = new FakeLlmClient();
    messyLlm.complete = async (req) => {
      if (req.system.includes('工程师')) {
        return '以下是代码：\n```html\n<!DOCTYPE html>\n<html><body>ok</body></html>\n```\n希望有用';
      }
      return new FakeLlmClient().complete(req);
    };
    const orc = new Orchestrator({
      llm: messyLlm,
      gate: new AutoApproveGate(),
      checkpointer: new Checkpointer(repos),
      emit: () => {},
    });
    const result = await orc.runProject({ idea: 'x' });

    expect(result.artifact.content).not.toContain('```');
    expect(result.artifact.content).not.toContain('以下是');
    expect(result.artifact.content.trimEnd().endsWith('</html>')).toBe(true);
    const art = await repos.artifacts.latestByRun(result.runId);
    expect(art?.content).toBe(result.artifact.content);
  });

  it('FINAL-REVIEW I-1: 工程师解析出空 index.html 时，artifact 经 ensureHtml 兜底（非空且可渲染）', async () => {
    const { repos } = setup();
    // 模拟：parseFiles 提到 src/index.html 围栏，但内容为空 → assembled === ''
    const emptyHtmlLlm = new FakeLlmClient();
    emptyHtmlLlm.complete = async (req) => {
      if (req.system.includes('工程师')) {
        return 'src/index.html\n```html\n\n```\n';
      }
      return new FakeLlmClient().complete(req);
    };
    const orc = new Orchestrator({
      llm: emptyHtmlLlm,
      gate: new AutoApproveGate(),
      checkpointer: new Checkpointer(repos),
      emit: () => {},
    });
    const result = await orc.runProject({ idea: '做一个待办应用' });

    // 关键断言：永不为空 + 是完整可渲染 HTML（fallbackHtml 而非裸 shim）
    expect(result.artifact.content.length).toBeGreaterThan(0);
    expect(result.artifact.content).toContain('<html');
    expect(result.artifact.content).toContain('</html>');
  });

  it('FINAL-REVIEW I-1: 工程师解析出畸形（截断）index.html 时，artifact 经 ensureHtml 修复闭合', async () => {
    const { repos } = setup();
    const truncatedLlm = new FakeLlmClient();
    truncatedLlm.complete = async (req) => {
      if (req.system.includes('工程师')) {
        return 'src/index.html\n```html\n<!DOCTYPE html>\n<html><body><p>截断了\n```\n';
      }
      return new FakeLlmClient().complete(req);
    };
    const orc = new Orchestrator({
      llm: truncatedLlm,
      gate: new AutoApproveGate(),
      checkpointer: new Checkpointer(repos),
      emit: () => {},
    });
    const result = await orc.runProject({ idea: 'x' });

    expect(result.artifact.content).toContain('<html');
    expect(result.artifact.content).toContain('</html>');
  });

  it('docu-system: 每角色产物落成对应文件夹的文件，engineer 组装为单 HTML 预览', async () => {
    const { repos } = setup();
    const orc = new Orchestrator({
      llm: new FakeLlmClient(),
      gate: new AutoApproveGate(),
      checkpointer: new Checkpointer(repos),
      emit: () => {},
    });
    const result = await orc.runProject({ idea: '做一个待办应用' });

    const files = await repos.files.listByRun(result.runId);
    const paths = files.map((f) => f.path);
    expect(paths).toContain('pm/spec.md');
    expect(paths).toContain('architect/arch.md');
    // 工程师至少落一个 src 下的 html
    expect(paths.some((p) => p.startsWith('src/') && p.endsWith('.html'))).toBe(true);
    // 预览 artifact 仍是单个自包含 HTML
    expect(result.artifact.filename).toBe('index.html');
    expect(result.artifact.content).toContain('<');
  });

  it('问题2: 工程师 code 完成即落 artifact + emit artifact_ready（预览不依赖收尾）', async () => {
    const { repos, events } = setup();
    const orc = new Orchestrator({
      llm: new FakeLlmClient(),
      gate: new AutoApproveGate(),
      checkpointer: new Checkpointer(repos),
      emit: (e) => events.push(e),
    });
    const result = await orc.runProject({ idea: '做一个待办应用' });

    // 时机断言：artifact_ready 必须在 run_done 之前发出（工程师 stage_done 时预览就可用）
    const types = events.map((e) => e.type);
    const readyIdx = types.indexOf('artifact_ready');
    const runDoneIdx = types.indexOf('run_done');
    expect(readyIdx).toBeGreaterThanOrEqual(0);
    expect(readyIdx).toBeLessThan(runDoneIdx);

    // artifact_ready 载荷：自包含 HTML
    const readyEv = events.find((e) => e.type === 'artifact_ready') as Extract<OrchestratorEvent, { type: 'artifact_ready' }>;
    expect(readyEv.artifact.filename).toBe('index.html');
    expect(readyEv.artifact.content).toContain('<');

    // 落库可读回（不必等收尾）
    const art = await repos.artifacts.latestByRun(result.runId);
    expect(art).toBeTruthy();
    expect(art!.filename).toBe('index.html');
    expect(art!.content).toContain('<');
  });

  it('问题2: 每级通过才落文件；被驳回的中间版不落盘', async () => {
    const { repos } = setup();
    // 闸门：spec 第一次驳回、第二次通过；其余自动通过
    const gate = {
      calls: 0,
      async wait(_r: string, g: string) {
        if (g === 'spec') {
          this.calls++;
          return this.calls === 1 ? { approved: false, comment: '重写' } : { approved: true };
        }
        return { approved: true };
      },
    };
    // 在 files_saved 事件触发瞬间检查 repo：该级文件应已落盘（T3 前：false；T3 后：true）
    const filesSavedSnapshot: Array<{ stage: string; presentAtEmit: boolean; iters: number[] }> = [];
    const pending: Promise<void>[] = [];
    const emit = (e: OrchestratorEvent) => {
      if (e.type === 'files_saved') {
        const stage = e.stage;
        const runId = e.runId;
        const path = stage === 'spec' ? 'pm/spec.md' : stage === 'architecture' ? 'architect/arch.md' : null;
        const sync = async () => {
          const all = await repos.files.listByRun(runId);
          const matches = path ? all.filter((f) => f.path === path) : all.filter((f) => f.path.startsWith('src/'));
          filesSavedSnapshot.push({ stage, presentAtEmit: matches.length > 0, iters: matches.map((m) => m.iteration) });
        };
        // emit 是同步回调，排队 async 检查
        pending.push(sync());
      }
    };
    const orc = new Orchestrator({
      llm: new FakeLlmClient(),
      gate: gate as any,
      checkpointer: new Checkpointer(repos),
      emit,
    });
    const result = await orc.runProject({ idea: '做一个待办应用' });
    await Promise.all(pending);

    // T3 核心断言：spec 批准瞬间 pm/spec.md 已落盘；architecture 批准瞬间 architect/arch.md 已落盘；code 批准瞬间 src/* 已落盘
    const specSnap = filesSavedSnapshot.find((s) => s.stage === 'spec');
    const archSnap = filesSavedSnapshot.find((s) => s.stage === 'architecture');
    const codeSnap = filesSavedSnapshot.find((s) => s.stage === 'code');
    expect(specSnap?.presentAtEmit).toBe(true);
    expect(archSnap?.presentAtEmit).toBe(true);
    expect(codeSnap?.presentAtEmit).toBe(true);
    // spec 批准时刻落的版本必须是 iteration=2（通过版），不能是 1（被驳回版）
    expect(specSnap!.iters.length).toBeGreaterThan(0);
    expect(specSnap!.iters.every((i) => i === 2)).toBe(true);

    // 收尾后汇总断言
    const files = await repos.files.listByRun(result.runId);
    const specFiles = files.filter((f) => f.path === 'pm/spec.md');
    // 被驳回的中间版（iteration 1）不落盘：所有 spec 文件 iteration 都应是通过版 2
    expect(specFiles.every((f) => f.iteration === 2)).toBe(true);
    expect(specFiles.some((f) => f.iteration === 1)).toBe(false);
    expect(files.map((f) => f.path)).toEqual(expect.arrayContaining(['pm/spec.md', 'architect/arch.md']));
    expect(files.some((f) => f.path.startsWith('src/'))).toBe(true);

    // T4：每级通过的文件恰好各落一次（不再被收尾二次落盘）
    expect(files.filter((f) => f.path === 'pm/spec.md')).toHaveLength(1);
    expect(files.filter((f) => f.path === 'architect/arch.md')).toHaveLength(1);
    // 工程师阶段：FakeLlmClient 单文件输出 → src/index.html 恰好一次
    expect(files.filter((f) => f.path === 'src/index.html')).toHaveLength(1);
  });

  it('修改1B/2: 驳回时落一条 ReviewFeedback 消息(replyTo 指向被驳产物)，且不污染产物', async () => {
    const { repos, events } = setup();
    // gate: spec 第1次驳回(comment='重写规格') 第2次通过；其余自动过
    const gate = {
      calls: 0,
      async wait(_r: string, g: string) {
        if (g === 'spec') {
          this.calls++;
          return this.calls === 1 ? { approved: false, comment: '重写规格' } : { approved: true };
        }
        return { approved: true };
      },
    };
    const orc = new Orchestrator({
      llm: new FakeLlmClient(),
      gate: gate as any,
      checkpointer: new Checkpointer(repos),
      emit: (e) => events.push(e),
    });
    const result = await orc.runProject({ idea: '做一个待办应用' });

    const msgs = await repos.messages.listByRun(result.runId);
    // 1) 存在一条 ReviewFeedback：content 含驳回意见、replyTo 指向被驳回那版 spec（iteration 1）
    const fb = msgs.find((m) => m.causeBy === 'ReviewFeedback');
    expect(fb).toBeTruthy();
    expect(fb!.content).toContain('重写规格');
    const rejectedSpec = msgs.find((m) => m.stage === 'spec' && m.iteration === 1 && m.causeBy !== 'ReviewFeedback');
    expect(rejectedSpec).toBeTruthy();
    expect(fb!.replyTo).toBe(rejectedSpec!.id);

    // 2) 不污染产物：spec 产物仍是 RunSpecAction（feedback 不算 spec 产物）
    const specProducts = msgs.filter((m) => m.stage === 'spec' && m.causeBy !== 'ReviewFeedback');
    expect(specProducts.map((m) => m.iteration)).toEqual([1, 2]); // 被驳 v1 + 通过 v2

    // 3) stage_done 事件携带了反馈消息（前端可据此出气泡，Task 5 渲染）
    const fbEvent = events.find(
      (e) => e.type === 'stage_done' && e.message.causeBy === 'ReviewFeedback',
    ) as Extract<OrchestratorEvent, { type: 'stage_done' }> | undefined;
    expect(fbEvent).toBeTruthy();
    expect(fbEvent!.message.replyTo).toBe(rejectedSpec!.id);

    // 4) 裸驳回（无 comment）不落反馈消息
    const { repos: repos2 } = setup();
    const gate2 = {
      calls: 0,
      async wait(_r: string, g: string) {
        if (g === 'spec') {
          this.calls++;
          return this.calls === 1 ? { approved: false, comment: '' } : { approved: true };
        }
        return { approved: true };
      },
    };
    const orc2 = new Orchestrator({
      llm: new FakeLlmClient(),
      gate: gate2 as any,
      checkpointer: new Checkpointer(repos2),
      emit: () => {},
    });
    const result2 = await orc2.runProject({ idea: 'x' });
    const msgs2 = await repos2.messages.listByRun(result2.runId);
    expect(msgs2.some((m) => m.causeBy === 'ReviewFeedback')).toBe(false);
  });

  it('T4: run_done 携带的 artifact 与 repos.artifacts.latestByRun 一致（兜底重放）', async () => {
    const { repos, events } = setup();
    const orc = new Orchestrator({
      llm: new FakeLlmClient(),
      gate: new AutoApproveGate(),
      checkpointer: new Checkpointer(repos),
      emit: (e) => events.push(e),
    });
    const result = await orc.runProject({ idea: '做一个待办应用' });

    const runDone = events.find((e) => e.type === 'run_done') as Extract<OrchestratorEvent, { type: 'run_done' }> | undefined;
    expect(runDone).toBeTruthy();
    const latest = await repos.artifacts.latestByRun(result.runId);
    expect(latest).toBeTruthy();
    expect(runDone!.artifact).toEqual({ kind: latest!.kind, filename: latest!.filename, content: latest!.content });
    // 同时与 RunResult.artifact 一致
    expect(result.artifact).toEqual(runDone!.artifact);
  });
});

describe('P5 逐级审批闸门（单向向前、驳回只重跑本级）', () => {
  /** 可控闸门：按队列依次返回批准/驳回，并记录每次 wait 的 gate。 */
  function queueGate(decisions: boolean[]) {
    const gates: string[] = [];
    let i = 0;
    return {
      gates,
      wait: async (_runId: string, gate: string) => {
        gates.push(gate);
        const approved = decisions[Math.min(i++, decisions.length - 1)];
        return { approved, comment: approved ? null : '重做' };
      },
    };
  }

  it('审批模式：spec/architecture 后各停一次（三道闸门，逐道推进）', async () => {
    const { repos } = setup();
    const gate = queueGate([true, true, true]);
    const orc = new Orchestrator({
      llm: new FakeLlmClient(),
      gate,
      checkpointer: new Checkpointer(repos),
      emit: () => {},
    });
    const result = await orc.runProject({ idea: 'x' });

    // 三道闸门各等一次，顺序 spec → architecture → code
    expect(gate.gates).toEqual(['spec', 'architecture', 'code']);
    expect(result.completed).toBe(true);
    expect(result.messages.map((m) => m.stage)).toEqual(['requirement', 'spec', 'architecture', 'code']);
  });

  it('驳回闸门1（spec）：只重跑 PM，不进入下游，再次挂起等批', async () => {
    const { repos } = setup();
    // 决策序列：spec 驳回 → spec 批准 → architecture 批准 → code 批准
    const gate = queueGate([false, true, true, true]);
    const orc = new Orchestrator({
      llm: new FakeLlmClient(),
      gate,
      checkpointer: new Checkpointer(repos),
      emit: () => {},
    });
    const result = await orc.runProject({ idea: 'x' });

    // spec 被拒一次后重跑再批，故 spec 闸门等了 2 次
    expect(gate.gates).toEqual(['spec', 'spec', 'architecture', 'code']);
    // 落库消息里 spec 出现 2 次（重跑 1 次），architecture/code 各 1 次
    // （修改1B/2：ReviewFeedback 是旁白非产物，按产物统计）
    const msgs = await repos.messages.listByRun(result.runId);
    const count = (s: string) => msgs.filter((m) => m.stage === s && m.causeBy !== 'ReviewFeedback').length;
    expect(count('spec')).toBe(2);
    expect(count('architecture')).toBe(1);
    expect(count('code')).toBe(1);
    // 重跑的 spec 属于 iteration 2
    const specIters = msgs.filter((m) => m.stage === 'spec' && m.causeBy !== 'ReviewFeedback').map((m) => m.iteration);
    expect(specIters).toEqual([1, 2]);
  });

  it('单向性：闸门2（architecture）驳回只重跑 architecture，spec 不重跑', async () => {
    const { repos } = setup();
    // spec 批准 → architecture 驳回 → architecture 批准 → code 批准
    const gate = queueGate([true, false, true, true]);
    const orc = new Orchestrator({
      llm: new FakeLlmClient(),
      gate,
      checkpointer: new Checkpointer(repos),
      emit: () => {},
    });
    const result = await orc.runProject({ idea: 'x' });

    expect(gate.gates).toEqual(['spec', 'architecture', 'architecture', 'code']);
    const msgs = await repos.messages.listByRun(result.runId);
    // 修改1B/2：ReviewFeedback 是旁白非产物，按产物统计
    const count = (s: string) => msgs.filter((m) => m.stage === s && m.causeBy !== 'ReviewFeedback').length;
    // spec 只跑了 1 次（单向，不回头）
    expect(count('spec')).toBe(1);
    expect(count('architecture')).toBe(2);
    expect(count('code')).toBe(1);
  });
});

describe('问题5-T2: 预览优先用自包含 index.html 原文（assembleHtml 降为兜底）', () => {
  it('自包含 index.html + 拆分文件：预览用原文（含内联 style/script），不被重新组装', async () => {
    const { repos } = setup();
    const rawIndex = '<!DOCTYPE html>\n<html><head><style>body{background:#123}</style></head><body><button id="x">go</button><script>document.getElementById("x").onclick=()=>console.log("INLINE")</script></body></html>';
    const llm = new FakeLlmClient();
    llm.complete = async (req) => {
      if (req.system.includes('工程师')) {
        return [
          'src/index.html',
          '```html',
          rawIndex,
          '```',
          'src/app.js',
          '```js',
          'console.log("SPLIT-APP")',
          '```',
        ].join('\n');
      }
      return new FakeLlmClient().complete(req);
    };
    const orc = new Orchestrator({
      llm,
      gate: new AutoApproveGate(),
      checkpointer: new Checkpointer(repos),
      emit: () => {},
    });
    const result = await orc.runProject({ idea: 'x' });
    // 预览必须来自原文（含内联 style + 内联 script 标识）
    expect(result.artifact.content).toContain('body{background:#123}');
    expect(result.artifact.content).toContain('INLINE');
    // 不残留对外链引用（自包含契约下不应有 <script src> 或 <link href> 指向本地）
    expect(result.artifact.content).not.toContain('src="app.js"');
    expect(result.artifact.content).not.toContain('href="style.css"');
    // 仍落库可读回
    const art = await repos.artifacts.latestByRun(result.runId);
    expect(art?.content).toBe(result.artifact.content);
  });

  it('index.html 引用了未产出的 main.js：走组装兜底，产物无悬空 <script src="main.js">', async () => {
    const { repos } = setup();
    // 工程师声明 index.html 引用 main.js，但只产出 index.html（main.js 未产出 → 404 风险）
    const llm = new FakeLlmClient();
    llm.complete = async (req) => {
      if (req.system.includes('工程师')) {
        return [
          'src/index.html',
          '```html',
          '<!DOCTYPE html><html><body><p>app</p><script src="main.js"></script></body></html>',
          '```',
        ].join('\n');
      }
      return new FakeLlmClient().complete(req);
    };
    const orc = new Orchestrator({
      llm,
      gate: new AutoApproveGate(),
      checkpointer: new Checkpointer(repos),
      emit: () => {},
    });
    const result = await orc.runProject({ idea: 'x' });
    // 兜底链必须保证：无悬空的本地 <script src="main.js">（避免 404）
    expect(result.artifact.content).not.toContain('src="main.js"');
    // 仍是非空可渲染 HTML
    expect(result.artifact.content).toContain('<html');
    expect(result.artifact.content).toContain('</html>');
    // 落库一致
    const art = await repos.artifacts.latestByRun(result.runId);
    expect(art?.content).toBe(result.artifact.content);
  });
});

describe('P5 run 状态生命周期与迭代上限', () => {
  it('全部批准后 runs 状态落 completed（不留 running）', async () => {
    const { repos } = setup();
    const orc = new Orchestrator({
      llm: new FakeLlmClient(),
      gate: new AutoApproveGate(),
      checkpointer: new Checkpointer(repos),
      emit: () => {},
    });
    const result = await orc.runProject({ idea: 'x' });
    const run = await repos.runs.getById(result.runId);
    expect(run?.status).toBe('completed');
  });

  it('LLM 抛错时 runs 状态落 failed 并记录 error（不留 running）', async () => {
    const { repos } = setup();
    const badLlm = new FakeLlmClient();
    badLlm.complete = async () => { throw new Error('LLM 不可用'); };
    const orc = new Orchestrator({
      llm: badLlm,
      gate: new AutoApproveGate(),
      checkpointer: new Checkpointer(repos),
      emit: () => {},
    });
    await expect(orc.runProject({ idea: 'x' })).rejects.toThrow('LLM 不可用');
    const runs = await repos.runs.listByProject((await repos.projects.listByOwner('anon'))[0].id);
    expect(runs[0].status).toBe('failed');
    expect(runs[0].error).toContain('LLM 不可用');
  });

  it('驳回重跑有上限：超过 MAX_ITERATION 后中止该级并标记 failed', async () => {
    const { repos } = setup();
    // 永远驳回 → 应在上限处停止而非死循环
    const gate = { wait: async () => ({ approved: false as const, comment: '重做' }) };
    const orc = new Orchestrator({
      llm: new FakeLlmClient(),
      gate,
      checkpointer: new Checkpointer(repos),
      emit: () => {},
    });
    const result = await orc.runProject({ idea: 'x' });
    // 达到上限后流程中止（completed=false），不会无限重跑
    expect(result.completed).toBe(false);
    const runs = await repos.runs.listByProject((await repos.projects.listByOwner('anon'))[0].id);
    expect(runs[0].status).toBe('failed');
    // spec 重跑次数被上限钳制（有限次，非无穷）
    const msgs = await repos.messages.listByRun(result.runId);
    const specCount = msgs.filter((m) => m.stage === 'spec').length;
    expect(specCount).toBeGreaterThan(1);
    expect(specCount).toBeLessThanOrEqual(10);
  });
});

describe('code-review 修复（R3/R5）', () => {
  it('R5: 驳回重跑期间 run 状态回到 running（不留 awaiting_approval）', async () => {
    const { repos } = setup();
    // 记录 setStatus 的完整序列
    const statusSeq: string[] = [];
    const origSet = repos.runs.setStatus.bind(repos.runs);
    repos.runs.setStatus = (async (id: string, st: string, cs?: unknown, er?: unknown) => {
      statusSeq.push(st);
      return origSet(id, st as never, cs as never, er as never);
    }) as never;

    // spec 驳回一次 → 重跑 → 批准；之后全批准
    const decisions = [
      { approved: false, comment: '改' },
      { approved: true }, { approved: true }, { approved: true },
    ];
    let i = 0;
    const gate = { wait: async () => decisions[Math.min(i++, decisions.length - 1)] };
    const orc = new Orchestrator({ llm: new FakeLlmClient(), gate, checkpointer: new Checkpointer(repos), emit: () => {} });
    await orc.runProject({ idea: 'x' });

    // 序列应是：awaiting_approval(第一次等) → running(驳回后重跑) → awaiting_approval(重跑后等) → running(批准) ...
    // 关键：awaiting_approval 之间必须有 running（驳回重跑期），不能连着两个 awaiting_approval
    const firstAwait = statusSeq.indexOf('awaiting_approval');
    const afterFirst = statusSeq.slice(firstAwait + 1);
    // 驳回后必须先回 running 再回到 awaiting_approval（重跑完成再次等批）
    expect(afterFirst[0]).toBe('running');
    expect(afterFirst).toContain('awaiting_approval'); // 重跑完成后再次挂起
  });

  it('R3: 超迭代上限时发出 error 事件（SSE 能收尾）', async () => {
    const { repos, events } = setup();
    const gate = { wait: async () => ({ approved: false as const, comment: '重做' }) };
    const orc = new Orchestrator({
      llm: new FakeLlmClient(), gate, checkpointer: new Checkpointer(repos), emit: (e) => events.push(e),
    });
    const result = await orc.runProject({ idea: 'x' });
    expect(result.completed).toBe(false);
    // 必须发出一个终态 error 事件，SSE 才能关闭、UI 才能显示失败
    expect(events.some((e) => e.type === 'error')).toBe(true);
  });
});
