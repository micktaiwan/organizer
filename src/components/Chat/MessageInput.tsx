import React, { useRef, useEffect, useCallback } from "react";
import { Image, Paperclip, FileText, Mic, X, Video } from "lucide-react";
import { formatDuration } from "../../utils/audio";
import { useAuth } from "../../contexts/AuthContext";
import { VideoRecordingUI } from "./VideoRecorder";
import { VideoRecorderState, VideoSource } from "../../hooks/useVideoRecorder";

interface PendingFile {
  file: File;
  name: string;
  size: number;
}

// Helper to format file size
const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

interface MessageInputProps {
  inputMessage: string;
  setInputMessage: (val: string) => void;
  onSendMessage: (e: React.FormEvent) => void;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  pendingImage: string | null;
  cancelPendingImage: () => void;
  pendingFile: PendingFile | null;
  cancelPendingFile: () => void;
  canSend: boolean;
  isRecording: boolean;
  recordingDuration: number;
  startRecording: () => void;
  stopRecording: () => void;
  cancelRecording: () => void;
  onSelectImageFile: () => void;
  onSelectFile: () => void;
  // Video recording props
  videoRecorderState: VideoRecorderState;
  videoSource: VideoSource | null;
  videoStream: MediaStream | null;
  videoDuration: number;
  onStartVideoRecording: () => void;
  onPauseVideoRecording: () => void;
  onResumeVideoRecording: () => void;
  onStopVideoRecording: () => void;
  onCancelVideoRecording: () => void;
}

export const MessageInput: React.FC<MessageInputProps> = ({
  inputMessage,
  onSendMessage,
  onInputChange,
  pendingImage,
  cancelPendingImage,
  pendingFile,
  cancelPendingFile,
  canSend,
  isRecording,
  recordingDuration,
  startRecording,
  stopRecording,
  cancelRecording,
  onSelectImageFile,
  onSelectFile,
  // Video
  videoRecorderState,
  videoSource,
  videoStream,
  videoDuration,
  onStartVideoRecording,
  onPauseVideoRecording,
  onResumeVideoRecording,
  onStopVideoRecording,
  onCancelVideoRecording,
}) => {
  const { user } = useAuth();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea based on content
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
    }
  }, []);

  const isVideoRecording = videoRecorderState === 'recording' || videoRecorderState === 'paused';

  useEffect(() => {
    if (!isRecording && !isVideoRecording) {
      textareaRef.current?.focus();
    }
  }, [isRecording, isVideoRecording]);

  useEffect(() => {
    adjustTextareaHeight();
  }, [inputMessage, adjustTextareaHeight]);

  // Handle Enter to send, Shift+Enter for new line
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (inputMessage.trim() || pendingImage || pendingFile) {
        onSendMessage(e as unknown as React.FormEvent);
      }
    }
  };

  return (
    <>
      {pendingImage && (
        <div className="pending-image-preview">
          <img src={pendingImage} alt="Preview" />
          <button type="button" onClick={cancelPendingImage} className="cancel-image">
            ×
          </button>
        </div>
      )}

      {pendingFile && (
        <div className="pending-file-preview">
          <div className="pending-file-icon">
            <FileText size={24} />
          </div>
          <div className="pending-file-info">
            <span className="pending-file-name">{pendingFile.name}</span>
            <span className="pending-file-size">{formatFileSize(pendingFile.size)}</span>
          </div>
          <button type="button" onClick={cancelPendingFile} className="cancel-file">
            <X size={16} />
          </button>
        </div>
      )}

      <form className={`message-input${user?.isBot ? ' bot-mode' : ''}`} onSubmit={onSendMessage}>
        {isVideoRecording ? (
          <VideoRecordingUI
            duration={videoDuration}
            isPaused={videoRecorderState === 'paused'}
            stream={videoStream}
            source={videoSource}
            onPause={onPauseVideoRecording}
            onResume={onResumeVideoRecording}
            onStop={onStopVideoRecording}
            onCancel={onCancelVideoRecording}
          />
        ) : isRecording ? (
          <div className="recording-ui">
            <span className="recording-indicator">🔴</span>
            <span className="recording-duration">{formatDuration(recordingDuration)}</span>
            <button type="button" className="cancel-recording" onClick={cancelRecording}>
              ✕
            </button>
            <button type="button" className="stop-recording" onClick={stopRecording}>
              ✓ Envoyer
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              className="attach-btn"
              onClick={onSelectImageFile}
              disabled={!canSend || !!pendingFile}
              title="Joindre une image"
            >
              <Image size={20} />
            </button>
            <button
              type="button"
              className="attach-btn file-btn"
              onClick={onSelectFile}
              disabled={!canSend || !!pendingImage}
              title="Joindre un fichier"
            >
              <Paperclip size={20} />
            </button>
            <button
              type="button"
              className="voice-btn"
              onClick={startRecording}
              disabled={!canSend || isVideoRecording}
              title="Enregistrer un message vocal"
            >
              <Mic size={20} />
            </button>
            <button
              type="button"
              className="video-btn"
              onClick={onStartVideoRecording}
              disabled={!canSend || isRecording}
              title="Enregistrer une vidéo"
            >
              <Video size={20} />
            </button>
            <textarea
              ref={textareaRef}
              value={inputMessage}
              onChange={onInputChange}
              onKeyDown={handleKeyDown}
              placeholder={pendingImage || pendingFile ? "Ajouter une légende..." : `${user?.displayName || user?.username || ''}: Tapez un message...`}
              autoFocus
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              rows={1}
            />
            <button type="submit" disabled={!inputMessage.trim() && !pendingImage && !pendingFile}>
              Envoyer
            </button>
          </>
        )}
      </form>
    </>
  );
};

