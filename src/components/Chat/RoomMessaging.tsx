import React from 'react';
import { Room } from '../../services/api';
import { Message } from '../../types';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';

interface PendingFile {
  file: File;
  name: string;
  size: number;
}

interface RoomMessagingProps {
  currentRoom: Room | null;
  messages: Message[];
  onSendMessage: (text?: string, image?: string, audio?: string) => void;
  onSendFile: (file: File, caption?: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onReactMessage?: (messageId: string, emoji: string) => void;
  currentUserId?: string;
  inputMessage: string;
  setInputMessage: (text: string) => void;
  pendingImage: string | null;
  cancelPendingImage: () => void;
  pendingFile: PendingFile | null;
  setPendingFile: (file: PendingFile | null) => void;
  isRecording: boolean;
  recordingDuration: number;
  startRecording: () => void;
  stopRecording: () => void;
  cancelRecording: () => void;
  onSelectImageFile: () => void;
  onSelectFile: () => void;
}

export const RoomMessaging: React.FC<RoomMessagingProps> = ({
  currentRoom,
  messages,
  onSendMessage,
  onSendFile,
  onDeleteMessage,
  onReactMessage,
  currentUserId,
  inputMessage,
  setInputMessage,
  pendingImage,
  cancelPendingImage,
  pendingFile,
  setPendingFile,
  isRecording,
  recordingDuration,
  startRecording,
  stopRecording,
  cancelRecording,
  onSelectImageFile,
  onSelectFile,
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

    // Handle file sending
    if (pendingFile) {
      onSendFile(pendingFile.file, inputMessage || undefined);
      setInputMessage('');
      setPendingFile(null);
      return;
    }

    if (!inputMessage.trim() && !pendingImage) return;
    onSendMessage(inputMessage || undefined, pendingImage || undefined);
    setInputMessage('');
    cancelPendingImage();
  };

  const cancelPendingFile = () => {
    setPendingFile(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputMessage(e.target.value);
  };

  return (
    <div className="room-messaging">
      <MessageList
        messages={messages}
        isRemoteTyping={false}
        onDeleteMessage={onDeleteMessage}
        onReactMessage={onReactMessage}
        currentUserId={currentUserId}
        roomMemberCount={currentRoom.members.length}
      />

      <MessageInput
        inputMessage={inputMessage}
        setInputMessage={setInputMessage}
        onSendMessage={handleSendMessage}
        onInputChange={handleInputChange}
        pendingImage={pendingImage}
        cancelPendingImage={cancelPendingImage}
        pendingFile={pendingFile}
        cancelPendingFile={cancelPendingFile}
        canSend={true}
        isRecording={isRecording}
        recordingDuration={recordingDuration}
        startRecording={startRecording}
        onSelectImageFile={onSelectImageFile}
        onSelectFile={onSelectFile}
        stopRecording={stopRecording}
        cancelRecording={cancelRecording}
      />
    </div>
  );
};
