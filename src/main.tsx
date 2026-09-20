import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import SharePage from './pages/SharePage';
import './index.css';

// 最小前端路由：/p/:shareId → 只读分享页，其余 → 主应用。不引 react-router（为一条路由加依赖不值）。
const m = window.location.pathname.match(/^\/p\/([0-9a-fA-F-]{36})$/);

createRoot(document.getElementById('root')!).render(
  <StrictMode>{m ? <SharePage shareId={m[1]} /> : <App />}</StrictMode>,
);
