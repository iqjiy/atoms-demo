# Atoms Demo

多 Agent 协作驱动应用生成的 Demo（P0 脚手架阶段）。

## 在线体验

**https://atoms-demo-7yvj.onrender.com/**

> 部署于 Render（常驻 Node 服务，Express 托管前端 `dist` + API 同源）。免费实例闲置 15 分钟后休眠，首次访问可能需等待冷启动。

## 本地开发

```bash
npm install
npm run dev        # 一键同启前端(Vite:5173) + 后端(Express:3001)
```

打开 http://localhost:5173

## 测试

```bash
npm test           # Vitest 单测 + 集成测试
```

## 生产构建与启动

```bash
npm run build      # vite build + 后端 tsc 编译
npm start          # node dist-server/server/index.js（托管 dist 静态产物 + API）
```

## 环境变量

见 `.env.example`。
