import { useState, useRef, useCallback } from "react";
import { tempDir } from "@tauri-apps/api/path";
import { writeFile, remove, exists } from "@tauri-apps/plugin-fs";

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export type VideoSource = 'screen' | 'webcam';
export type VideoRecorderState = 'idle' | 'recording' | 'paused' | 'previewing' | 'uploading';
export type VideoQuality = 'high' | 'medium' | 'low';

export const VIDEO_QUALITY_PRESETS: Record<VideoQuality, { bitrate: number; resolution: number; label: string; description: string }> = {
  high: { bitrate: 5_000_000, resolution: 1080, label: 'Haute', description: '1080p ~5 Mbps' },
  medium: { bitrate: 2_000_000, resolution: 720, label: 'Moyenne', description: '720p ~2 Mbps' },
  low: { bitrate: 1_000_000, resolution: 480, label: 'Basse', description: '480p ~1 Mbps' },
};

const STORAGE_KEY_QUALITY = 'video-recorder-quality';
const STORAGE_KEY_SOURCE = 'video-recorder-source';

function loadSavedQuality(): VideoQuality {
  const saved = localStorage.getItem(STORAGE_KEY_QUALITY);
  if (saved && (saved === 'high' || saved === 'medium' || saved === 'low')) {
    return saved;
  }
  return 'medium';
}

interface UseVideoRecorderReturn {
  // State
  state: VideoRecorderState;
  source: VideoSource | null;
  quality: VideoQuality;
  duration: number;
  previewUrl: string | null;
  videoBlob: Blob | null;
  error: string | null;
  stream: MediaStream | null; // Live stream for webcam preview
  uploadProgress: number; // 0-100

  // Actions
  setQuality: (quality: VideoQuality) => void;
  selectSource: (source: VideoSource) => Promise<boolean>;
  startRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopRecording: () => void;
  discardVideo: () => void;
  restartRecording: () => void;
  setUploading: () => void;
  setUploadProgress: (progress: number) => void;
  reset: () => void;
}

/**
 * Get the best supported mime type for video recording
 */
function getSupportedMimeType(): string {
  const types = [
    'video/mp4;codecs=avc1',       // Safari/macOS WebView
    'video/webm;codecs=vp9,opus',  // Chrome (best quality)
    'video/webm;codecs=vp8,opus',  // Firefox
    'video/webm',                   // Fallback
  ];
  return types.find(t => MediaRecorder.isTypeSupported(t)) || 'video/webm';
}

export const useVideoRecorder = (): UseVideoRecorderReturn => {
  const [state, setState] = useState<VideoRecorderState>('idle');
  const [source, setSource] = useState<VideoSource | null>(null);
  const [quality, setQualityState] = useState<VideoQuality>(loadSavedQuality);

  // Wrapper to save quality to localStorage
  const setQuality = useCallback((q: VideoQuality) => {
    setQualityState(q);
    localStorage.setItem(STORAGE_KEY_QUALITY, q);
  }, []);
  const [duration, setDuration] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mimeTypeRef = useRef<string>('video/webm');
  const cancelledRef = useRef<boolean>(false);
  const tempFilePathRef = useRef<string | null>(null);

  const cleanup = useCallback((cancelled = false) => {
    // Mark as cancelled to prevent onstop from creating preview
    if (cancelled) {
      cancelledRef.current = true;
    }
    // Stop timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    // Stop MediaRecorder if active
    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current = null;
    }
    // Stop stream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setStream(null);
    // Clear chunks
    chunksRef.current = [];
  }, []);

  const cleanupPreview = useCallback(async () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setVideoBlob(null);

    // Delete temp file (Tauri only)
    if (isTauri() && tempFilePathRef.current) {
      try {
        const fileExists = await exists(tempFilePathRef.current);
        if (fileExists) {
          await remove(tempFilePathRef.current);
          console.log(`Temp video file deleted: ${tempFilePathRef.current}`);
        }
      } catch (err) {
        console.warn('Failed to delete temp video file:', err);
      }
      tempFilePathRef.current = null;
    }
  }, [previewUrl]);

  const reset = useCallback(() => {
    cleanup(true); // Pass true to mark as cancelled
    cleanupPreview();
    setState('idle');
    setSource(null);
    setDuration(0);
    setError(null);
  }, [cleanup, cleanupPreview]);

  const selectSource = useCallback(async (selectedSource: VideoSource): Promise<boolean> => {
    setError(null);
    cleanupPreview();

    const preset = VIDEO_QUALITY_PRESETS[quality];
    const idealHeight = preset.resolution;
    const idealWidth = Math.round(idealHeight * 16 / 9);

    try {
      let stream: MediaStream;

      if (selectedSource === 'screen') {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: { ideal: idealWidth },
            height: { ideal: idealHeight },
          },
          audio: true, // System audio if supported
        });

        // Also try to get microphone audio
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          // Combine screen video with mic audio
          const audioTrack = audioStream.getAudioTracks()[0];
          if (audioTrack) {
            stream.addTrack(audioTrack);
          }
        } catch {
          // Mic not available, continue with screen audio only (or no audio)
          console.log('Microphone not available, using screen audio only');
        }
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: idealWidth },
            height: { ideal: idealHeight },
            facingMode: 'user',
          },
          audio: true,
        });
      }

      // Handle stream ended (user clicked "Stop sharing" in browser UI)
      // Use mediaRecorderRef.state directly to avoid stale closure on React state
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        const recorderState = mediaRecorderRef.current?.state;
        if (recorderState === 'recording' || recorderState === 'paused') {
          mediaRecorderRef.current?.stop();
        }
      });

      streamRef.current = stream;
      setStream(stream);
      setSource(selectedSource);
      localStorage.setItem(STORAGE_KEY_SOURCE, selectedSource);
      return true;
    } catch (err) {
      console.error('Failed to get media stream:', err);
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          setError('Permission refusée. Autorisez l\'accès à la caméra/écran.');
        } else if (err.name === 'NotFoundError') {
          setError('Aucune caméra ou écran disponible.');
        } else {
          setError(`Erreur: ${err.message}`);
        }
      }
      return false;
    }
  }, [cleanupPreview, quality]);

  const startRecording = useCallback(() => {
    if (!streamRef.current) {
      setError('Aucune source sélectionnée');
      return;
    }

    const mimeType = getSupportedMimeType();
    mimeTypeRef.current = mimeType;
    const preset = VIDEO_QUALITY_PRESETS[quality];

    const mediaRecorder = new MediaRecorder(streamRef.current, {
      mimeType,
      videoBitsPerSecond: preset.bitrate,
    });

    chunksRef.current = [];
    cancelledRef.current = false;
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    mediaRecorder.onstop = async () => {
      // Skip preview if cancelled
      if (cancelledRef.current) {
        cancelledRef.current = false;
        return;
      }
      // Create blob and preview URL
      const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
      const url = URL.createObjectURL(blob);

      // Save to temp file for crash protection (Tauri only)
      if (isTauri()) {
        try {
          const ext = mimeTypeRef.current.includes('mp4') ? 'mp4' : 'webm';
          const tempPath = await tempDir();
          const filePath = `${tempPath}organizer-recording-${Date.now()}.${ext}`;
          const arrayBuffer = await blob.arrayBuffer();
          await writeFile(filePath, new Uint8Array(arrayBuffer));
          tempFilePathRef.current = filePath;
          console.log(`Video saved to temp: ${filePath}`);
        } catch (err) {
          console.warn('Failed to save temp video file:', err);
        }
      }

      setVideoBlob(blob);
      setPreviewUrl(url);
      setState('previewing');
      cleanup();
    };

    mediaRecorder.onerror = (e) => {
      console.error('MediaRecorder error:', e);
      setError('Erreur pendant l\'enregistrement');
      reset();
    };

    // Start recording with chunks every 1 second
    mediaRecorder.start(1000);
    setState('recording');
    setDuration(0);
    setError(null);

    // Start timer
    timerRef.current = setInterval(() => {
      setDuration(prev => prev + 1);
    }, 1000);
  }, [cleanup, quality, reset]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && state === 'recording') {
      mediaRecorderRef.current.pause();
      setState('paused');
      // Pause timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [state]);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && state === 'paused') {
      mediaRecorderRef.current.resume();
      setState('recording');
      // Resume timer
      timerRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    }
  }, [state]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && (state === 'recording' || state === 'paused')) {
      mediaRecorderRef.current.stop();
      // State will be set to 'previewing' in onstop callback
    }
  }, [state]);

  const discardVideo = useCallback(() => {
    cleanupPreview();
    setState('idle');
    setSource(null);
    setDuration(0);
  }, [cleanupPreview]);

  const restartRecording = useCallback(async () => {
    cleanupPreview();
    setDuration(0);

    if (source) {
      const success = await selectSource(source);
      if (success) {
        startRecording();
      }
    }
  }, [cleanupPreview, source, selectSource, startRecording]);

  const setUploading = useCallback(() => {
    setState('uploading');
    setUploadProgress(0);
  }, []);

  return {
    state,
    source,
    quality,
    duration,
    previewUrl,
    videoBlob,
    error,
    stream,
    uploadProgress,
    setQuality,
    selectSource,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    discardVideo,
    restartRecording,
    setUploading,
    setUploadProgress,
    reset,
  };
};
