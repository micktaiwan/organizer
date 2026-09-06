import { act, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { AccountSession } from '../../src/components/AccountSession';
import { useGallery } from '../../src/hooks/useGallery';
import { api } from '../../src/services/api';

const identity = vi.hoisted(() => ({ user: { id: 'A' }, token: 'access-A', server: { id: 'prod', url: 'https://test' } }));
vi.mock('../../src/contexts/AuthContext', () => ({ useAuth: () => identity }));
vi.mock('../../src/contexts/ServerConfigContext', () => ({ useServerConfig: () => ({ selectedServer: identity.server }) }));
vi.mock('../../src/services/socket', () => ({ socketService: { on: () => () => {} } }));

function Gallery() {
  const { files } = useGallery();
  return <div>{files.map(f => <span key={f.id}>{f.fileName}</span>)}</div>;
}

it('clears the gallery on account switch and ignores late responses from the old account', async () => {
  let resolveOld!: (response: any) => void;
  vi.spyOn(api, 'getFiles').mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
    .mockResolvedValue({ files: [{ id: 'B', fileName: 'B file' } as any] });
  identity.user = { id: 'A' };
  const { rerender } = render(<AccountSession><Gallery /></AccountSession>);
  identity.user = { id: 'B' };
  rerender(<AccountSession><Gallery /></AccountSession>);
  await screen.findByText('B file');
  await act(async () => { resolveOld({ files: [{ id: 'A', fileName: 'Private A file' }] }); });
  expect(screen.queryByText('Private A file')).toBeNull();
  expect(screen.getByText('B file')).toBeTruthy();
  expect(api.getFiles).toHaveBeenCalledTimes(2);

  identity.token = 'refreshed-B';
  rerender(<AccountSession><Gallery /></AccountSession>);
  expect(api.getFiles).toHaveBeenCalledTimes(2);
});

it('hides already loaded account files immediately while the next account loads', async () => {
  vi.spyOn(api, 'getFiles').mockResolvedValueOnce({ files: [{ id: 'A', fileName: 'Private A file' } as any] })
    .mockImplementationOnce(() => new Promise(() => {}));
  identity.user = { id: 'A' };
  const { rerender } = render(<AccountSession><Gallery /></AccountSession>);
  await screen.findByText('Private A file');
  identity.user = { id: 'B' };
  rerender(<AccountSession><Gallery /></AccountSession>);
  expect(screen.queryByText('Private A file')).toBeNull();
});
