import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useRooms } from '../../src/hooks/useRooms';
import { api } from '../../src/services/api';
import { socketService } from '../../src/services/socket';

const handlers = vi.hoisted(() => new Map<string, Set<(...args: any[]) => void>>());
vi.mock('../../src/services/socket', () => ({ socketService: {
  on: vi.fn((event, handler) => {
    if (!handlers.has(event)) handlers.set(event, new Set());
    handlers.get(event)!.add(handler);
    return () => handlers.get(event)!.delete(handler);
  }), joinRoom: vi.fn(), leaveRoom: vi.fn(),
} }));
vi.mock('../../src/utils/audio', () => ({ playNotificationSound: vi.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
const message = (room: string) => ({
  _id: `message-${room}`, roomId: room, senderId: 'me', content: room,
  type: 'text' as const, status: 'sent' as const, readBy: [], createdAt: '2026-09-06T00:00:00Z',
});
const unread = (room: string) => ({
  messages: [message(room)], firstUnreadId: null, hasOlderUnread: false, totalUnread: 0, skippedUnread: 0,
});

beforeEach(() => {
  handlers.clear();
  vi.spyOn(api, 'getRooms').mockResolvedValue({ rooms: [] });
  vi.spyOn(api, 'getRoom').mockImplementation(async id => ({ room: { _id: id, name: id } as any }));
  vi.spyOn(api, 'getUnreadMessages').mockImplementation(async id => unread(id));
  vi.spyOn(api, 'markRoomAsRead').mockResolvedValue({ success: true });
});

it('ignores an old room history arriving after the new room', async () => {
  const old = deferred<ReturnType<typeof unread>>();
  vi.mocked(api.getUnreadMessages).mockImplementation(id => id === 'A' ? old.promise : Promise.resolve(unread(id)));
  const { result } = renderHook(() => useRooms({ userId: 'me', username: 'Me' }));
  await act(async () => { result.current.selectRoom('A'); });
  await waitFor(() => expect(api.getUnreadMessages).toHaveBeenCalledWith('A'));
  await act(async () => { result.current.selectRoom('B'); });
  expect(result.current.messages[0].text).toBe('B');
  await act(async () => { old.resolve(unread('A')); });
  expect(result.current.currentRoomId).toBe('B');
  expect(result.current.currentRoom?._id).toBe('B');
  expect(result.current.messages.map(m => m.text)).toEqual(['B']);
  expect(api.markRoomAsRead).not.toHaveBeenCalledWith('A');
});

it('does not join a room whose details arrive after navigation', async () => {
  const old = deferred<any>();
  vi.mocked(api.getRoom).mockImplementation(id => id === 'A' ? old.promise : Promise.resolve({ room: { _id: id } as any }));
  const { result } = renderHook(() => useRooms({ userId: 'me', username: 'Me' }));
  await act(async () => { result.current.selectRoom('A'); });
  await act(async () => { result.current.selectRoom('B'); });
  await act(async () => { old.resolve({ room: { _id: 'A' } }); });
  expect(socketService.joinRoom).not.toHaveBeenCalledWith('A');
  expect(result.current.currentRoom?._id).toBe('B');
});

it('discards pagination results after switching rooms', async () => {
  const old = deferred<any>();
  vi.spyOn(api, 'getRoomMessages').mockReturnValue(old.promise);
  const { result } = renderHook(() => useRooms({ userId: 'me', username: 'Me' }));
  await act(async () => { result.current.selectRoom('A'); });
  let loading!: Promise<void>;
  act(() => { loading = result.current.loadOlderMessages(); });
  await act(async () => { result.current.selectRoom('B'); });
  await act(async () => { old.resolve({ messages: [message('A-older')] }); await loading; });
  expect(result.current.messages.map(m => m.text)).toEqual(['B']);
  expect(result.current.isLoadingMore).toBe(false);
});

it('discards a message fetched from a socket event for the previous room', async () => {
  const old = deferred<any>();
  vi.spyOn(api, 'getMessage').mockReturnValue(old.promise);
  const { result } = renderHook(() => useRooms({ userId: 'me', username: 'Me' }));
  await act(async () => { result.current.selectRoom('A'); });
  act(() => handlers.get('message:new')?.forEach(fn => fn({ roomId: 'A', messageId: 'late', from: 'other' })));
  await act(async () => { result.current.selectRoom('B'); });
  await act(async () => { old.resolve({ message: message('A-late') }); });
  expect(result.current.messages.map(m => m.text)).toEqual(['B']);
});

it('keeps room details when a newer history request starts before details arrive', async () => {
  const details = deferred<any>();
  vi.mocked(api.getRoom).mockReturnValue(details.promise);
  vi.spyOn(api, 'getRoomMessages').mockResolvedValue({ messages: [message('A-new')] });
  const { result } = renderHook(() => useRooms({ userId: 'me', username: 'Me' }));
  await act(async () => { result.current.selectRoom('A'); });
  await act(async () => { await result.current.loadMessages(); });
  await act(async () => { details.resolve({ room: { _id: 'A' } }); });
  expect(result.current.currentRoom?._id).toBe('A');
  expect(result.current.messages[0].text).toBe('A-new');
});
