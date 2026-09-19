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
});
