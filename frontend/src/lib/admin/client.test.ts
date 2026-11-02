import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  changePassword,
  completePasswordReset,
  confirmTotp,
  createAdminUser,
  enrollTotp,
  getAdminUser,
  getCurrentAdmin,
  listAdminUsers,
  login,
  logout,
  regenerateRecoveryCodes,
  requestPasswordReset,
  resetAdminUserTotp,
  updateAdminUser,
  verifySecondFactor,
} from './client';
import type { AdminUser } from './client';

const admin: AdminUser = {
  id: '01890000-0000-7000-8000-000000000001',
  email: 'owner@example.test',
  display_name: 'Owner',
  role: 'owner',
  status: 'active',
  totp_confirmed_at: '2026-10-22T20:00:00Z',
  last_login_at: '2026-11-01T13:14:00Z',
  password_changed_at: '2026-10-22T20:00:00Z',
  version: 3,
  created_at: '2026-10-22T20:00:00Z',
  updated_at: '2026-10-22T20:00:00Z',
};

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function problem(status: number, code: string, headers: Record<string, string> = {}): Response {
  return new Response(
    JSON.stringify({ type: `https://monteluna.co/problems/${code}`, title: code, status, code }),
    { status, headers: { 'Content-Type': 'application/problem+json', ...headers } }
  );
}

describe('Admin identity client (T1: S1, S4)', () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function lastCall(): { url: string; init: RequestInit } {
    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    return { url, init };
  }

  describe('request transport', () => {
    it('sends same-origin credentials, no-store, and JSON accept headers', async () => {
      fetchMock.mockResolvedValue(json(200, { next_step: 'totp_required' }));

      await login('owner@example.test', 'correct horse battery');

      const { url, init } = lastCall();
      expect(url).toBe('/api/v1/admin/sessions');
      expect(init.method).toBe('POST');
      expect(init.credentials).toBe('same-origin');
      expect(init.cache).toBe('no-store');
      expect(init.headers).toEqual({
        Accept: 'application/json, application/problem+json',
        'Content-Type': 'application/json',
      });
      expect(init.body).toBe(
        JSON.stringify({ email: 'owner@example.test', password: 'correct horse battery' })
      );
    });

    it('omits Content-Type and body when there is no request body', async () => {
      fetchMock.mockResolvedValue(json(200, admin, { ETag: '"3"' }));

      await getCurrentAdmin();

      const { url, init } = lastCall();
      expect(url).toBe('/api/v1/admin/sessions/current');
      expect(init.method).toBe('GET');
      expect(init.headers).toEqual({ Accept: 'application/json, application/problem+json' });
      expect(init.body).toBeUndefined();
    });

    it('returns the parsed body and the ETag on success', async () => {
      fetchMock.mockResolvedValue(json(200, admin, { ETag: '"3"' }));

      const result = await getCurrentAdmin();

      expect(result).toEqual({ ok: true, data: admin, etag: '"3"' });
    });

    it('returns the Problem code and status on an error response', async () => {
      fetchMock.mockResolvedValue(problem(401, 'invalid_credentials'));

      const result = await login('owner@example.test', 'wrong password!');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('invalid_credentials');
        expect(result.status).toBe(401);
        expect(result.problem?.code).toBe('invalid_credentials');
        expect(result.retryAfterSeconds).toBeUndefined();
      }
    });

    it('exposes Retry-After seconds on rate_limited', async () => {
      fetchMock.mockResolvedValue(problem(429, 'rate_limited', { 'Retry-After': '840' }));

      const result = await login('owner@example.test', 'wrong password!');

      expect(result).toMatchObject({ ok: false, code: 'rate_limited', status: 429, retryAfterSeconds: 840 });
    });

    it('falls back to http_<status> when the error body is not a Problem', async () => {
      fetchMock.mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }));

      const result = await getCurrentAdmin();

      expect(result).toMatchObject({ ok: false, code: 'http_502', status: 502 });
    });

    it('maps a rejected fetch to network_error with status 0', async () => {
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

      const result = await getCurrentAdmin();

      expect(result).toMatchObject({ ok: false, code: 'network_error', status: 0 });
    });

    it('treats 204 No Content as success without a body', async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

      const result = await logout();

      expect(result).toEqual({ ok: true, data: null, etag: null });
      expect(lastCall().url).toBe('/api/v1/admin/sessions/current');
      expect(lastCall().init.method).toBe('DELETE');
    });
  });

  describe('operations match the identity contract', () => {
    beforeEach(() => {
      fetchMock.mockImplementation(async () => json(200, {}));
    });

    it.each([
      ['verifySecondFactor TOTP', () => verifySecondFactor({ totp_code: '123456' }), 'POST', '/api/v1/admin/sessions/verify', { totp_code: '123456' }],
      ['verifySecondFactor recovery code', () => verifySecondFactor({ recovery_code: 'abcd-efgh' }), 'POST', '/api/v1/admin/sessions/verify', { recovery_code: 'abcd-efgh' }],
      ['enrollTotp', () => enrollTotp(), 'POST', '/api/v1/admin/totp/enroll', undefined],
      ['confirmTotp', () => confirmTotp('654321'), 'POST', '/api/v1/admin/totp/confirm', { totp_code: '654321' }],
      ['requestPasswordReset', () => requestPasswordReset('owner@example.test'), 'POST', '/api/v1/admin/password-resets', { email: 'owner@example.test' }],
      ['completePasswordReset', () => completePasswordReset('tok', 'a long new passphrase'), 'POST', '/api/v1/admin/password-resets/complete', { token: 'tok', new_password: 'a long new passphrase' }],
      [
        'changePassword',
        () => changePassword({ current_password: 'old one', new_password: 'new passphrase!!', second_factor: { totp_code: '111111' } }),
        'POST',
        '/api/v1/admin/password/change',
        { current_password: 'old one', new_password: 'new passphrase!!', second_factor: { totp_code: '111111' } },
      ],
      [
        'regenerateRecoveryCodes',
        () => regenerateRecoveryCodes({ current_password: 'old one', second_factor: { totp_code: '222222' } }),
        'POST',
        '/api/v1/admin/recovery-codes/regenerate',
        { current_password: 'old one', second_factor: { totp_code: '222222' } },
      ],
      ['createAdminUser', () => createAdminUser({ email: 'staff@example.test', display_name: 'Staff', role: 'staff' }), 'POST', '/api/v1/admin/users', { email: 'staff@example.test', display_name: 'Staff', role: 'staff' }],
      ['getAdminUser', () => getAdminUser('id-1'), 'GET', '/api/v1/admin/users/id-1', undefined],
    ])('%s', async (_name, call, method, url, body) => {
      await call();
      const last = lastCall();
      expect(last.url).toBe(url);
      expect(last.init.method).toBe(method);
      expect(last.init.body).toBe(body === undefined ? undefined : JSON.stringify(body));
    });

    it('listAdminUsers sends only the given cursor and limit', async () => {
      await listAdminUsers();
      expect(lastCall().url).toBe('/api/v1/admin/users');

      await listAdminUsers({ limit: 25, cursor: 'abc/=+' });
      expect(lastCall().url).toBe('/api/v1/admin/users?limit=25&cursor=abc%2F%3D%2B');
    });

    it('encodes path identifiers', async () => {
      await getAdminUser('a/b');
      expect(lastCall().url).toBe('/api/v1/admin/users/a%2Fb');
    });

    it('updateAdminUser sends PATCH with the exact If-Match ETag', async () => {
      await updateAdminUser('id-1', '"3"', { status: 'disabled' });

      const { url, init } = lastCall();
      expect(url).toBe('/api/v1/admin/users/id-1');
      expect(init.method).toBe('PATCH');
      expect(init.headers).toMatchObject({ 'If-Match': '"3"', 'Content-Type': 'application/json' });
      expect(init.body).toBe(JSON.stringify({ status: 'disabled' }));
    });

    it("resetAdminUserTotp sends If-Match and no body", async () => {
      await resetAdminUserTotp('id-1', '"4"');

      const { url, init } = lastCall();
      expect(url).toBe('/api/v1/admin/users/id-1/totp/reset');
      expect(init.method).toBe('POST');
      expect(init.headers).toEqual({ Accept: 'application/json, application/problem+json', 'If-Match': '"4"' });
      expect(init.body).toBeUndefined();
    });
  });
});
