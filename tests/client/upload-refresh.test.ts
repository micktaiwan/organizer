import { expect, it, vi } from 'vitest';
import { ApiService, setApiBaseUrl } from '../../src/services/api';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

it('refreshes an expired token and retries an image upload instead of failing', async () => {
  setApiBaseUrl('https://test');
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(json(401, { error: 'Token expiré' }))
    .mockResolvedValueOnce(json(200, { token: 'fresh', refreshToken: 'refresh-2' }))
    .mockResolvedValueOnce(json(201, { message: { _id: 'm1', content: '/uploads/x.png' } }));
  vi.stubGlobal('fetch', fetchMock);

  const service = new ApiService();
  service.setToken('expired');
  service.setRefreshToken('refresh-1');

  const { message } = await service.sendMessage('lobby', 'image', undefined, undefined, new Blob(['x']));

  expect(message._id).toBe('m1');
  expect(fetchMock.mock.calls[1][0]).toBe('https://test/auth/refresh');
  expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('Bearer fresh');
});

it('keeps the session when the refresh endpoint is unreachable', async () => {
  setApiBaseUrl('https://test');
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(json(401, { error: 'Token expiré' }))
    .mockRejectedValueOnce(new TypeError('Failed to fetch')));

  const service = new ApiService();
  service.setToken('expired');
  service.setRefreshToken('refresh-1');
  service.onAuthExpired = vi.fn();

  await expect(service.getMe()).rejects.toThrow('Impossible de se connecter');
  expect(service.onAuthExpired).not.toHaveBeenCalled();
  expect(service.getRefreshToken()).toBe('refresh-1');
});

it('logs out when the server rejects the refresh token', async () => {
  setApiBaseUrl('https://test');
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(json(401, { error: 'Token expiré' }))
    .mockResolvedValueOnce(json(401, { error: 'Refresh token invalide ou expiré' })));

  const service = new ApiService();
  service.setToken('expired');
  service.setRefreshToken('refresh-1');
  service.onAuthExpired = vi.fn();

  await expect(service.getMe()).rejects.toThrow('Session expirée');
  expect(service.onAuthExpired).toHaveBeenCalledOnce();
});
