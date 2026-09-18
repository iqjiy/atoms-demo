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

  it('script 内含 <head> 字面量时仍注入到真实 head（review 发现4）', () => {
    const html = '<!DOCTYPE html><html><head><script>var s="<head>"</script></head><body>x</body></html>';
    const out = injectStorageShim(html);
    // shim 必须在真实 <head> 之后、且在该 script 之前
    const realHead = out.indexOf('<head>');
    const shimIdx = out.indexOf(STORAGE_SHIM);
    const scriptIdx = out.indexOf('var s=');
    expect(shimIdx).toBeGreaterThan(realHead);
    expect(shimIdx).toBeLessThan(scriptIdx);
    // shim 不应出现在 script 字符串内部
    expect(out.indexOf(`var s="<head>${STORAGE_SHIM}`)).toBe(-1);
  });

  it('script 出现在 head 标签之前且含 <head> 字面量（罕见但可能）', () => {
    const html = '<!DOCTYPE html><script>var s="<head>"</script><html><head></head><body>x</body></html>';
    const out = injectStorageShim(html);
    // shim 不应被注入到 script 字符串里
    expect(out.indexOf(`var s="<head>${STORAGE_SHIM}`)).toBe(-1);
  });
});
