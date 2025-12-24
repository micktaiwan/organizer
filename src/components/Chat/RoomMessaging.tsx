import React from 'react';
import { Room } from '../../services/api';
import { Message } from '../../types';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';

interface RoomMessagingProps {
  currentRoom: Room | null;
  messages: Message[];
  onSendMessage: (text?: string, image?: string, audio?: string) => void;
  inputMessage: string;
  setInputMessage: (text: string) => void;
  pendingImage: string | null;
  cancelPendingImage: () => void;
  isRecording: boolean;
  recordingDuration: number;
  startRecording: () => void;
  stopRecording: () => void;
  cancelRecording: () => void;
}

export const RoomMessaging: React.FC<RoomMessagingProps> = ({
  currentRoom,
  messages,
  onSendMessage,
  inputMessage,
  setInputMessage,
  pendingImage,
  cancelPendingImage,
  isRecording,
  recordingDuration,
  startRecording,
  stopRecording,
  cancelRecording,
}) => {
  if (!currentRoom) {
    return (
      <div className="room-messaging-empty">
        <p>Sélectionnez un salon pour commencer</p>
      </div>
    );
  }

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() && !pendingImage) return;
    onSendMessage(inputMessage || undefined, pendingImage || undefined);
    setInputMessage('');
    cancelPendingImage();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputMessage(e.target.value);
  };

  return (
    <div className="room-messaging">
      <MessageList messages={messages} isRemoteTyping={false} />

      <MessageInput
        inputMessage={inputMessage}
        setInputMessage={setInputMessage}
        onSendMessage={handleSendMessage}
        onInputChange={handleInputChange}
        pendingImage={pendingImage}
        cancelPendingImage={cancelPendingImage}
        canSend={true}
        isRecording={isRecording}
        recordingDuration={recordingDuration}
        startRecording={startRecording}
        stopRecording={stopRecording}
        cancelRecording={cancelRecording}
      />
    </div>
  );
};
