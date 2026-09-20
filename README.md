# Atoms Demo

> 一个「多 Agent 协作驱动应用生成」的网页应用：用户用自然语言描述需求，三个 Agent（产品经理 → 架构师 → 工程师）接力，实时逐字流式生成，产物落成 `/pm`、`/architect`、`/src` 文档工作区，应用可全屏预览（沙箱 iframe 可玩），数据落库持久化。

- **公网地址**：https://atoms-demo-7yvj.onrender.com/
- **在线体验**：公网默认跑「确定性演示模式」（Fake 模板，零成本看完整流程）；**真实生成已开启访问口令**，受邀者点带口令的链接即可现场真生成。
- **只读分享页**：作品完成后可生成 `/p/:shareId` 只读链接，任何人打开即看「三 Agent 接力全过程 + 可玩产物」，无需登录、不能操作。

---

## 一、实现思路

**核心命题**：不是「用 AI 生成一段代码」，而是「让多个 Agent 像真实团队一样接力，把想法一步步变成可运行的应用」。

### 架构（一句话）

三栏 Web 应用 + **自研轻量多 Agent 编排器**（复刻 MetaGPT `causeBy` + `watch` 类型订阅路由）+ 外部托管 Neon Postgres + SSE 流式推送 + iframe srcdoc 沙箱预览。

```
你输入想法（可选「逐级审批 / 直接生成」）
  → PM 产出需求 spec（逐字流出）
  → 架构师读 spec 产出架构
  → 工程师读架构产出单文件自包含 HTML
  → 右栏 iframe 沙箱实时可玩
```

| 关注点 | 取舍 |
|---|---|
| **编排器** | 不引框架，自研 ~250 行：线性 Pipeline（PM→Architect→Engineer）+ 审批闸门 + 局部重跑（驳回带意见本级重跑）。LLM 经 `LlmClient` 接口可互换（`DeepSeekClient` 真实 / `FakeLlmClient` 确定性）。 |
| **流式** | SSE 逐 token 推送；关页/切换会话可从落库数据重放，进行中再叠加 SSE 增量。 |
| **预览安全** | `iframe srcdoc sandbox="allow-scripts"`（不含 `allow-same-origin`）+ storage shim（内存版 localStorage），不破沙箱又能玩。 |
| **文档系统** | 产物落 `files` 表（path→content KV），右栏文件树工作区；每级「通过」分别落盘，驳回中间版不落盘。 |
| **持久化** | 外部托管 Neon Postgres（5 表：projects/runs/messages/artifacts/approvals + files），刷新/重开历史仍在。 |
| **三条红线不砍** | 真实交互 + 数据持久化 + 可测试在线链接。 |

> 详细架构见 `atoms/system_design.md`；各阶段验收见 `task/stages/p0.md ~ p6.md`。

---

## 二、当前完成度

P0–P5 + 文档系统 + 多轮实测修复全部完成，公网已部署：

- ✅ **真实交互**：三 Agent 逐字接力 + 逐级审批闸门（通过 / 驳回带意见本级重跑）+ 体验迭代环。
- ✅ **数据持久化**：Neon Postgres，关页重放、刷新不丢。
- ✅ **可玩预览**：生成的应用（扫雷 / 待办 / 抽奖等）在沙箱里真实可玩。
- ✅ **延展能力**（非 PoC）：审批迭代环、文档系统工作区（文件树落库）、多轮重跑、只读分享页。
- ✅ **公网安全**：访问口令 + IP/全局每日限流，额度可控不被刷。
- **测试**：`npm test` 197 通过 + 13 跳过（真实库契约按需）；构建 + 类型检查全绿。

### 快速上手

```bash
cd app
npm install
cp .env.example .env.local   # 填 DATABASE_URL(Neon) + LLM_API_KEY(DeepSeek，可选)
npm run dev                  # 前端 5173 + 后端 3001
npm test                     # 197 通过 + 13 跳过
```

> 不配 `LLM_API_KEY` 也能跑（回退 Fake 确定性模板，流程/流式/审批/预览都在）。

---

## 三、AI Coding 的使用

本项目全程以 **Claude Code** 为主要 AI 结对编程工具，践行「vibe coding」但保持工程纪律：

- **方案先行，文档驱动**：每个阶段（P0–P6）先有验收标准 + 方案文档（`task/stages/*.md`），AI 按文档实施，避免「边写边想」跑偏。
- **TDD 全程**：每个能力先写失败测试（红）再实现（绿），如只读分享页、口令门禁都是先红后绿。
- **AI 做「重活」，人做「判断」**：架构选型、红线取舍、安全边界由人拍板；重复性实现（路由、组件、测试样板）交给 AI。
- **多轮 code-review 闭环**：AI 产出差评 → 人审查 → AI 修复，累计修复 30+ 项（见 `task/stages/fix.md`）。
- **原子化提交**：按「问题1 / 问题2 / 问题4-B / 问题5…」小步提交，便于回溯与审阅。

> 这套「AI + 人审 + TDD + 文档」的组合，是把 6–8h 想法快速变成「可运行、可体验、可扩展」原型的关键。

---

## 四、未来如何扩展

以下方向已完成调研/设计（均为独立文档，未动主干代码），按优先级排期：

| 方向 | 文档 | 说明 |
|---|---|---|
| **全局多轮对话** | `task/research/global-dialog.md` | 一轮 = 新需求 + 全链路重跑；主对话管全局，触发当前参与的全部 Agent 基于新输入各重出一版。多轮上下文/状态机最复杂，单独立项。 |
| **可配置 Agent 服务** | `task/research/agent-config.md` | 链路数据驱动 + 落库（角色/提示词/顺序可配）；LLM 自动配 agent 为二期。前端已留「⚙ Agent配置」UI 占位。 |
| **完整使用系统（注册/账号）** | `task/research/ux-flow.md` §5 | 用户名 + 密码，进门即登录；取代当前匿名 ownerId + 分享链接的轻量方案，支持作品归属、列表管理、撤销分享。 |
| 血缘追溯 / 版本历史 / 断点续跑 | `task/plans/plan919.md` §3 | 零新基建的延展档 A。 |
| Race Mode / 模板库 / 生成中预览 | `task/plans/plan919.md` §3 | 延展档 B。 |

---

## 文档地图

| 文档 | 内容 |
|---|---|
| `project_info.md` | 挑战原始要求与硬要求 |
| `project-preview.md` | 项目全景预览（新对话入口） |
| `task/stages/p0.md ~ p6.md` | 各阶段验收标准 + 方案 + TDD 清单 |
| `task/stages/fix.md` | 所有 bug + 多轮 code-review 修复记录 |
| `task/api_SECURITY/plan.md` | 公网口令 + 限流防护方案 |
| `task/research/` | 全局对话 / Agent配置 / 使用流程 / 分享页 等拓展调研 |
| `atoms/` | 完整调研 + 架构设计（system_design + PlantUML） |
