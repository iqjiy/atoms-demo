import { describe, it, expect } from 'vitest';
import { assembleHtml, hasUninlinedLocalRef } from '../../../server/orchestrator/assembler.js';

describe('assembler：/src 多文件内联为单自包含 HTML', () => {
  it('把 link[href=css] 与 script[src=js] 内联进 html', () => {
    const files = [
      { path: 'src/index.html', content: '<html><head><link rel="stylesheet" href="style.css"></head><body><script src="app.js"></script></body></html>' },
      { path: 'src/style.css', content: 'body{color:red}' },
      { path: 'src/app.js', content: 'console.log(1)' },
    ];
    const out = assembleHtml(files)!;
    expect(out).toContain('<style>body{color:red}</style>');
    expect(out).toContain('<script>console.log(1)</script>');
    expect(out).not.toContain('href="style.css"');
    expect(out).not.toContain('src="app.js"');
  });

  it('无 html 文件返回 null（回退兜底）', () => {
    expect(assembleHtml([{ path: 'src/app.js', content: 'x' }])).toBeNull();
  });

  it('html 无外链时原样返回', () => {
    const files = [{ path: 'src/index.html', content: '<html><body>ok</body></html>' }];
    expect(assembleHtml(files)).toBe('<html><body>ok</body></html>');
  });

  it('未被 index.html 直接引用的本地 JS 依赖也会被内联（多文件不死按钮）', () => {
    const files = [
      { path: 'src/index.html', content: '<html><body><script src="app.js"></script></body></html>' },
      { path: 'src/app.js', content: 'const s = createStore(); render(s);' },
      { path: 'src/store.js', content: 'function createStore(){ return {}; }' },   // 未被 index.html 引用
      { path: 'src/render.js', content: 'function render(s){}' },                  // 未被引用
    ];
    const out = assembleHtml(files)!;
    expect(out).toContain('function createStore()');  // 依赖被内联
    expect(out).toContain('function render(s)');
    expect(out).toContain('const s = createStore()');
    expect(out).not.toContain('src="app.js"');
  });

  it('剩余 JS 追加在 </body> 前，且在被引用文件之后（保依赖序的宽松版）', () => {
    const files = [
      { path: 'src/index.html', content: '<html><body><script src="app.js"></script></body></html>' },
      { path: 'src/app.js', content: 'APP' },
      { path: 'src/util.js', content: 'UTIL' },
    ];
    const out = assembleHtml(files)!;
    expect(out.indexOf('APP')).toBeLessThan(out.indexOf('</body>'));
    expect(out.indexOf('UTIL')).toBeLessThan(out.indexOf('</body>'));
    expect(out).toContain('</body></html>');
  });

  it('CDN/绝对 URL 的 script 不被当本地文件处理（Tailwind CDN 保留）', () => {
    const files = [
      { path: 'src/index.html', content: '<html><head><script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script></head><body><script src="app.js"></script></body></html>' },
      { path: 'src/app.js', content: 'APP' },
    ];
    const out = assembleHtml(files)!;
    expect(out).toContain('https://cdn.jsdelivr.net');  // CDN 引用原样保留
    expect(out).toContain('<script>APP</script>');      // 本地 app.js 内联
  });

  it('同一文件不重复内联（幂等）', () => {
    const files = [
      { path: 'src/index.html', content: '<html><body><script src="app.js"></script></body></html>' },
      { path: 'src/app.js', content: 'APP' },
    ];
    const out = assembleHtml(files)!;
    expect(out.match(/APP/g)).toHaveLength(1);
  });

  it('真实死按钮结构回归：index.html 只引 app.js + style.css，app.js 依赖未被引用的 store.js/utils.js', () => {
    // 复刻问题4那次抽奖产物的结构：按钮无响应的根因是 store/utils 未被 index.html
    // 直接引用，组装时整个被丢弃，app.js 调用 createStore() 报 ReferenceError。
    const files = [
      {
        path: 'src/index.html',
        content: '<html><head><link rel="stylesheet" href="style.css"></head><body><button id="draw">抽奖</button><script src="app.js"></script></body></html>',
      },
      { path: 'src/app.js', content: 'const store = createStore(); document.getElementById("draw").addEventListener("click", () => renderApp(store));' },
      { path: 'src/store.js', content: 'function createStore(){ return { count: 0 }; }' },   // 未被 index.html 引用
      { path: 'src/utils.js', content: 'function renderApp(s){ s.count++; }' },              // 未被 index.html 引用
      { path: 'src/style.css', content: 'button{cursor:pointer}' },
    ];
    const out = assembleHtml(files)!;
    // app.js 自己必须在内（按钮绑定在这里）
    expect(out).toContain('document.getElementById("draw")');
    // 它依赖的两个全局函数也必须在内——否则按钮点击就 ReferenceError（死按钮复现）
    expect(out).toContain('function createStore()');
    expect(out).toContain('function renderApp(s)');
    // css 也要内联
    expect(out).toContain('<style>button{cursor:pointer}</style>');
    // 外链全部消失，产物是单自包含 HTML
    expect(out).not.toContain('src="app.js"');
    expect(out).not.toContain('href="style.css"');
  });
});

describe('hasUninlinedLocalRef：检测 html 引用了未产出的本地文件（会 404）', () => {
  it('引用了且产出过 → false（自包含成立）', () => {
    const html = '<html><head><link href="style.css" rel="stylesheet"></head><body><script src="app.js"></script></body></html>';
    const files = [
      { path: 'src/index.html', content: html },
      { path: 'src/style.css', content: 'body{}' },
      { path: 'src/app.js', content: 'x' },
    ];
    expect(hasUninlinedLocalRef(html, files)).toBe(false);
  });

  it('引用了但未产出 → true（触发自包含不成立，走组装兜底）', () => {
    const html = '<html><body><script src="main.js"></script></body></html>';
    const files = [{ path: 'src/index.html', content: html }]; // main.js 声明了但没产出
    expect(hasUninlinedLocalRef(html, files)).toBe(true);
  });

  it('link 引用未产出的 css → true', () => {
    const html = '<html><head><link rel="stylesheet" href="missing.css"></head><body></body></html>';
    const files = [{ path: 'src/index.html', content: html }];
    expect(hasUninlinedLocalRef(html, files)).toBe(true);
  });

  it('外部 CDN 引用被忽略（http(s):// 开头不算本地）', () => {
    const html = '<html><head><script src="https://cdn.jsdelivr.net/npm/x"></script><link href="https://cdn.example.com/y.css" rel="stylesheet"></head><body></body></html>';
    const files = [{ path: 'src/index.html', content: html }];
    expect(hasUninlinedLocalRef(html, files)).toBe(false);
  });

  it('协议相对 // 开头的外部 URL 也被忽略', () => {
    const html = '<html><head><script src="//cdn.example.com/x.js"></script></head><body></body></html>';
    const files = [{ path: 'src/index.html', content: html }];
    expect(hasUninlinedLocalRef(html, files)).toBe(false);
  });

  it('无引用 → false', () => {
    const html = '<html><body><script>console.log(1)</script></body></html>';
    const files = [{ path: 'src/index.html', content: html }];
    expect(hasUninlinedLocalRef(html, files)).toBe(false);
  });
});
