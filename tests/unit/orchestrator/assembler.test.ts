import { describe, it, expect } from 'vitest';
import { assembleHtml } from '../../../server/orchestrator/assembler.js';

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
});
