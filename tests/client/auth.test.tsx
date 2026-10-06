import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../../src/contexts/AuthContext';
import { api } from '../../src/services/api';

const server = vi.hoisted(() => ({ id: 'test', url: 'https://test.invalid' }));
vi.mock('../../src/contexts/ServerConfigContext', () => ({
  useServerConfig: () => ({ selectedServer: server, isConfigured: true }),
}));
vi.mock('../../src/services/socket', () => ({ socketService: {
  on: () => () => {}, connect: vi.fn(), disconnect: vi.fn(), updateAuth: vi.fn(),
} }));

const user = (id: string) => ({ id, username: id, displayName: id });
const account = (id: string, refreshToken: string | undefined = `${id}-refresh`) => ({
  id, userId: id, username: id, displayName: id, token: `${id}-access`, refreshToken,
  lastUsed: '2026-09-06T00:00:00Z',
});
const write = (key: string, value: unknown) => localStorage.setItem(`organizer_auth_${key}_test`, JSON.stringify(value));
const read = (key: string) => JSON.parse(localStorage.getItem(`organizer_auth_${key}_test`) || 'null');
const ok = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  api.setToken(null);
  api.setRefreshToken(null);
  write('auth_token', 'A-access');
  write('auth_refresh_token', 'A-refresh');
  write('saved_accounts', [account('A'), account('B')]);
});

it('persists rotated target tokens and can refresh them after restarting', async () => {
  let restarted = false;
  const refreshes: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith('/auth/refresh')) {
      const refresh = JSON.parse(init.body as string).refreshToken;
      refreshes.push(refresh);
      if (refresh === 'B-refresh' && refreshes.length === 1) return ok({ token: 'B-new-access', refreshToken: 'B-new-refresh' });
      if (refresh === 'B-new-refresh') return ok({ token: 'B-next-access', refreshToken: 'B-next-refresh' });
      return ok({ error: 'Revoked' }, 401);
    }
    const token = (init.headers as Record<string, string>).Authorization;
    if (token === 'Bearer B-access' || (restarted && token === 'Bearer B-new-access')) return ok({ error: 'Expired' }, 401);
    return ok({ user: user(token.includes('B-') ? 'B' : 'A') });
  }));

  const first = renderHook(() => useAuth(), { wrapper: AuthProvider });
  await waitFor(() => expect(first.result.current.user?.id).toBe('A'));
  await act(async () => { expect(await first.result.current.switchToAccount('B')).toEqual({ success: true }); });
  expect(first.result.current.user?.id).toBe('B');
  expect(api.getRefreshToken()).toBe('B-new-refresh');
  expect(read('auth_refresh_token')).toBe('B-new-refresh');
  expect(read('saved_accounts').find((a: any) => a.id === 'B').refreshToken).toBe('B-new-refresh');
  first.unmount();

  restarted = true;
  api.setToken(null);
  api.setRefreshToken(null);
  const second = renderHook(() => useAuth(), { wrapper: AuthProvider });
  await waitFor(() => expect(second.result.current.user?.id).toBe('B'));
  await waitFor(() => expect(second.result.current.isLoading).toBe(false));
  expect(refreshes).toEqual(['B-refresh', 'B-new-refresh']);
  expect(read('auth_refresh_token')).toBe('B-next-refresh');
  expect(read('saved_accounts').find((a: any) => a.id === 'B').refreshToken).toBe('B-next-refresh');
});

it('leaves the active session untouched when the target account is invalid', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const token = (init.headers as Record<string, string>).Authorization;
    if (url.endsWith('/auth/refresh') || token === 'Bearer B-access') return ok({ error: 'Invalid' }, 401);
    return ok({ user: user('A') });
  }));
  const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
  await waitFor(() => expect(result.current.user?.id).toBe('A'));
  const expiryCallback = api.onAuthExpired;
  await act(async () => { expect((await result.current.switchToAccount('B')).success).toBe(false); });
  expect(result.current.user?.id).toBe('A');
  expect(api.getToken()).toBe('A-access');
  expect(api.getRefreshToken()).toBe('A-refresh');
  expect(api.onAuthExpired).toBe(expiryCallback);
  expect(read('auth_refresh_token')).toBe('A-refresh');
});

it('clears the previous refresh token when the target account has none', async () => {
  write('saved_accounts', [account('A'), { ...account('B'), refreshToken: undefined }]);
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    const token = (init.headers as Record<string, string>).Authorization;
    return ok({ user: user(token.includes('B-') ? 'B' : 'A') });
  }));
  const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
  await waitFor(() => expect(result.current.user?.id).toBe('A'));
  await act(async () => { await result.current.switchToAccount('B'); });
  expect(api.getRefreshToken()).toBeNull();
  expect(read('auth_refresh_token')).toBeNull();
});

it('revokes and clears the session when an expired session logs out from a background request', async () => {
  const revoked: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith('/auth/refresh')) return ok({ error: 'Revoked' }, 401);
    if (url.endsWith('/auth/logout')) { revoked.push(JSON.parse(init.body as string).refreshToken); return ok({ success: true }); }
    return ok({ user: user('A') });
  }));
  const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
  await waitFor(() => expect(result.current.user?.id).toBe('A'));
  await act(async () => { api.onAuthExpired?.(); });
  await waitFor(() => expect(result.current.user).toBeNull());
  expect(read('auth_token')).toBeNull();
  expect(read('auth_refresh_token')).toBeNull();
  expect(revoked).toEqual(['A-refresh']);
});
