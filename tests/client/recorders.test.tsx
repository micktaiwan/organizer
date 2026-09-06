import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useVoiceRecorder } from '../../src/hooks/useVoiceRecorder';
import { useVideoRecorder } from '../../src/hooks/useVideoRecorder';

function useRecorder(kind: string) {
  const voice = useVoiceRecorder(vi.fn());
  const video = useVideoRecorder();
  return { start: () => kind === 'voice' ? voice.startRecording() : video.selectSource('webcam') };
}

it.each(['voice', 'video'])('releases %s tracks when the account session unmounts', async kind => {
  const stop = vi.fn();
  const track = { stop, addEventListener: vi.fn() };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
  vi.stubGlobal('MediaRecorder', class {
    static isTypeSupported() { return true; }
    state = 'inactive';
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; }
  });
  const { result, unmount } = renderHook(() => useRecorder(kind));
  await act(async () => { await result.current.start(); });
  unmount();
  expect(stop).toHaveBeenCalledOnce();
});

it.each(['voice', 'video'])('releases %s tracks if permission resolves after unmount', async kind => {
  let resolveStream!: (stream: unknown) => void;
  const stop = vi.fn();
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: () => new Promise(resolve => { resolveStream = resolve; }) } });
  const { result, unmount } = renderHook(() => useRecorder(kind));
  let starting!: Promise<unknown>;
  act(() => { starting = result.current.start(); });
  unmount();
  await act(async () => {
    resolveStream({ getTracks: () => [{ stop }] });
    await starting;
  });
  expect(stop).toHaveBeenCalledOnce();
});
