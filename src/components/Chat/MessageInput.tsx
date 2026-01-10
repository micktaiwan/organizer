import React, { useRef, useEffect } from "react";
import { Paperclip } from "lucide-react";
import { formatDuration } from "../../utils/audio";

interface MessageInputProps {
  inputMessage: string;
  setInputMessage: (val: string) => void;
  onSendMessage: (e: React.FormEvent) => void;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  pendingImage: string | null;
  cancelPendingImage: () => void;
  canSend: boolean;
  isRecording: boolean;
  recordingDuration: number;
  startRecording: () => void;
  stopRecording: () => void;
  cancelRecording: () => void;
  onSelectImageFile: () => void;
}

export const MessageInput: React.FC<MessageInputProps> = ({
  inputMessage,
  onSendMessage,
  onInputChange,
  pendingImage,
  cancelPendingImage,
  canSend,
  isRecording,
  recordingDuration,
  startRecording,
  stopRecording,
  cancelRecording,
  onSelectImageFile
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
              className="attach-btn"
              onClick={onSelectImageFile}
              disabled={!canSend}
              title="Joindre une image"
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

