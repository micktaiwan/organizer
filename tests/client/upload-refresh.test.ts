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
