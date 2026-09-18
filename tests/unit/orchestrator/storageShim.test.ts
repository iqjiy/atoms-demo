import { describe, it, expect } from 'vitest';
import { injectStorageShim, STORAGE_SHIM } from '../../../server/orchestrator/htmlGuard.js';

describe('injectStorageShim 注入内存版 storage 替身', () => {
  it('把 shim 脚本注入到 <head> 最前面（先于其他脚本）', () => {
    const html = '<!DOCTYPE html><html><head><script>localStorage.setItem("a","1")</script></head><body>x</body></html>';
    const out = injectStorageShim(html);
    const headOpen = out.indexOf('<head>');
    const shimIdx = out.indexOf(STORAGE_SHIM);
    const userScriptIdx = out.indexOf('localStorage.setItem("a"');
    expect(shimIdx).toBeGreaterThan(headOpen);
    expect(shimIdx).toBeLessThan(userScriptIdx); // shim 必须先于用户脚本
  });

  it('无 <head> 时注入到 <html> 之后', () => {
    const html = '<!DOCTYPE html><html><body>x</body></html>';
    const out = injectStorageShim(html);
    expect(out).toContain(STORAGE_SHIM);
  });

  it('shim 内容：定义内存版 localStorage/sessionStorage', () => {
    expect(STORAGE_SHIM).toContain('localStorage');
    expect(STORAGE_SHIM).toContain('sessionStorage');
    expect(STORAGE_SHIM).toContain('defineProperty');
  });

  it('幂等：重复注入不叠加', () => {
    const html = '<!DOCTYPE html><html><head></head><body>x</body></html>';
    const once = injectStorageShim(html);
    const twice = injectStorageShim(once);
    expect(once).toBe(twice); // 第二次调用原样返回
    const count = (twice.match(/defineProperty/g) || []).length;
    expect(count).toBe(1);
  });
});
