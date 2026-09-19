import { describe, it, expect } from 'vitest';
import { parseFiles } from '../../../server/orchestrator/fileParser.js';

describe('fileParser：Markdown 围栏 + 路径行解析多文件', () => {
  it('解析「路径行 + 围栏」为多个具名文件', () => {
    const raw = [
      'src/index.html', '```html', '<html><body>x</body></html>', '```',
      'src/app.js', '```js', 'console.log(1)', '```',
    ].join('\n');
    const files = parseFiles(raw, 'src');
    expect(files).toHaveLength(2);
    expect(files[0]).toEqual({ path: 'src/index.html', content: '<html><body>x</body></html>' });
    expect(files[1]).toEqual({ path: 'src/app.js', content: 'console.log(1)' });
  });

  it('裸文件名（无目录）归入 defaultDir', () => {
    const raw = 'index.html\n```html\n<a/>\n```';
    expect(parseFiles(raw, 'src')[0].path).toBe('src/index.html');
  });

  it('路径带反引号/加粗被清洗', () => {
    const raw = '**`src/style.css`**\n```css\nbody{}\n```';
    expect(parseFiles(raw, 'src')[0].path).toBe('src/style.css');
  });

  it('无任何文件块返回空数组（调用方回退单文件）', () => {
    expect(parseFiles('只是一段说明，没有代码块', 'src')).toEqual([]);
  });
});
