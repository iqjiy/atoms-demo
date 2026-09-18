/**
 * 三栏工作台骨架（P0 占位）：左输入 / 中过程 / 右预览。
 * 移动端退化为纵向堆叠（后续 P 阶段再换分页签）。
 */
export default function ThreePaneLayout() {
  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* 左栏：需求输入 */}
      <aside className="w-full border-b border-slate-200 bg-white p-4 md:w-72 md:border-b-0 md:border-r">
        <h1 className="text-lg font-semibold text-slate-900">Atoms Demo</h1>
        <p className="mt-1 text-sm text-slate-500">用自然语言描述你的想法</p>
        <textarea
          className="mt-4 h-28 w-full resize-none rounded-md border border-slate-300 p-2 text-sm focus:border-slate-400 focus:outline-none"
          placeholder="例如：做一个待办事项应用"
        />
        <button
          type="button"
          className="mt-2 w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          生成应用
        </button>
      </aside>

      {/* 中栏：Agent 协作过程 */}
      <section className="flex-1 border-b border-slate-200 bg-slate-50 p-4 md:border-b-0 md:border-r">
        <h2 className="text-sm font-medium text-slate-700">协作过程</h2>
        <div className="mt-4 rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
          产品经理 → 架构师 → 工程师
        </div>
      </section>

      {/* 右栏：实时预览 */}
      <section className="flex-1 bg-white p-4">
        <h2 className="text-sm font-medium text-slate-700">预览</h2>
        <div className="mt-4 flex h-64 items-center justify-center rounded-md border border-dashed border-slate-300 text-sm text-slate-400">
          生成的应用将在此预览
        </div>
      </section>
    </div>
  );
}
