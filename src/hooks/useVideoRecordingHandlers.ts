import { useState, useCallback } from "react";

interface UseVideoRecordingHandlersParams {
  selectVideoSource: (source: 'screen' | 'webcam') => Promise<boolean>;
  startVideoRecording: () => void;
  resetVideoRecorder: () => void;
  discardVideo: () => void;
  restartVideoRecording: () => void;
  setVideoUploading: () => void;
  setVideoUploadProgress: (progress: number) => void;
  sendVideo: (blob: Blob, replyToId?: string, onProgress?: (progress: number) => void) => Promise<void>;
  videoBlob: Blob | null;
}

export function useVideoRecordingHandlers({
  selectVideoSource,
  startVideoRecording,
  resetVideoRecorder,
  discardVideo,
  restartVideoRecording,
  setVideoUploading,
  setVideoUploadProgress,
  sendVideo,
  videoBlob,
}: UseVideoRecordingHandlersParams) {
  // Video recording - show source selector when user clicks video button
  const [showVideoSourceSelector, setShowVideoSourceSelector] = useState(false);

  const handleStartVideoRecording = useCallback(() => {
    setShowVideoSourceSelector(true);
  }, []);

  const handleSelectVideoSource = useCallback(async (source: 'screen' | 'webcam') => {
    setShowVideoSourceSelector(false);
    const success = await selectVideoSource(source);
    if (success) {
      startVideoRecording();
    }
  }, [selectVideoSource, startVideoRecording]);

  const handleCancelVideoSourceSelector = useCallback(() => {
    setShowVideoSourceSelector(false);
    resetVideoRecorder();
  }, [resetVideoRecorder]);

  const handleSendVideo = useCallback(async () => {
    if (!videoBlob) return;
    setVideoUploading();
    await sendVideo(videoBlob, undefined, setVideoUploadProgress);
    resetVideoRecorder();
  }, [videoBlob, setVideoUploading, sendVideo, setVideoUploadProgress, resetVideoRecorder]);

  const handleDiscardVideo = useCallback(() => {
    discardVideo();
  }, [discardVideo]);

  const handleRestartVideo = useCallback(() => {
    restartVideoRecording();
  }, [restartVideoRecording]);

  const handleCancelVideoRecording = useCallback(() => {
    resetVideoRecorder();
  }, [resetVideoRecorder]);

  return {
    showVideoSourceSelector,
    handleStartVideoRecording,
    handleSelectVideoSource,
    handleCancelVideoSourceSelector,
    handleSendVideo,
    handleDiscardVideo,
    handleRestartVideo,
    handleCancelVideoRecording,
  };
}
