import React, { useRef, useEffect } from "react";
import { formatDuration } from "../../utils/audio";

interface MessageInputProps {
  inputMessage: string;
  setInputMessage: (val: string) => void;
  onSendMessage: (e: React.FormEvent) => void;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  pendingImage: string | null;
  cancelPendingImage: () => void;
  connected: boolean;
  isRecording: boolean;
  recordingDuration: number;
  startRecording: () => void;
  stopRecording: () => void;
  cancelRecording: () => void;
}

export const MessageInput: React.FC<MessageInputProps> = ({
  inputMessage,
  onSendMessage,
  onInputChange,
  pendingImage,
  cancelPendingImage,
  connected,
  isRecording,
  recordingDuration,
  startRecording,
  stopRecording,
  cancelRecording
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
              className="voice-btn"
              onClick={startRecording}
              disabled={!connected}
              title="Enregistrer un message vocal"
            >
              🎤
            </button>
            <input
              ref={inputRef}
              type="text"
              value={inputMessage}
              onChange={onInputChange}
              placeholder={pendingImage ? "Ajouter une légende..." : "Tapez un message ou collez une image..."}
              autoFocus
            />
            <button type="submit" disabled={!inputMessage.trim() && !pendingImage}>
              Envoyer
            </button>
          </>
        )}
      </form>
    </>
  );
};

