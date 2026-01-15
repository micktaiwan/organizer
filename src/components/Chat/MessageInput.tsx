import React, { useRef, useEffect } from "react";
import { Image, Paperclip, FileText, X } from "lucide-react";
import { formatDuration } from "../../utils/audio";

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
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
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
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isRecording) {
      inputRef.current?.focus();
    }
  }, [isRecording]);

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

      <form className="message-input" onSubmit={onSendMessage}>
        {isRecording ? (
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
              disabled={!canSend}
              title="Enregistrer un message vocal"
            >
              🎤
            </button>
            <input
              ref={inputRef}
              type="text"
              value={inputMessage}
              onChange={onInputChange}
              placeholder={pendingImage || pendingFile ? "Ajouter une légende..." : "Tapez un message ou collez une image..."}
              autoFocus
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

