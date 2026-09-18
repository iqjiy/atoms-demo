import { describe, it, expect } from 'vitest';
import { resolveOwner } from '../../server/identity/identityService.js';

describe('resolveOwner', () => {
  it('issues a new uuid ownerId when no cookie present', () => {
    const result = resolveOwner(undefined);
    expect(result.isNew).toBe(true);
    expect(result.ownerId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('reuses an existing valid ownerId cookie without re-issuing', () => {
    const existing = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    const result = resolveOwner(existing);
    expect(result.isNew).toBe(false);
    expect(result.ownerId).toBe(existing);
  });

  it('issues a new ownerId when the cookie is malformed', () => {
    const result = resolveOwner('not-a-uuid');
    expect(result.isNew).toBe(true);
    expect(result.ownerId).not.toBe('not-a-uuid');
  });

  it('marks the cookie as HttpOnly and SameSite=Lax', () => {
    const result = resolveOwner(undefined);
    expect(result.cookie.httpOnly).toBe(true);
    expect(result.cookie.sameSite).toBe('lax');
  });
});
