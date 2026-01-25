import React, { useEffect, useRef, useMemo } from 'react';
import { Room } from '../../services/api';
import { Message } from '../../types';
import { VideoRecorderState, VideoSource } from '../../hooks/useVideoRecorder';
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
  typingUsers?: Set<string>;
  onTypingStart?: () => void;
  onTypingStop?: () => void;
  // Search/navigation props
  targetMessageId?: string | null;
  messageMode?: 'latest' | 'around';
  onReturnToLatest?: () => void;
  // Unread separator props
  firstUnreadId?: string | null;
  hasOlderUnread?: boolean;
  skippedUnreadCount?: number;
  // Pagination props
  hasMoreMessages?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
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
  typingUsers,
  onTypingStart,
  onTypingStop,
  targetMessageId,
  messageMode,
  onReturnToLatest,
  firstUnreadId,
  hasOlderUnread,
  skippedUnreadCount,
  hasMoreMessages,
  isLoadingMore,
  onLoadMore,
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
  // Use refs to avoid re-triggering effects when callbacks change reference
  const onTypingStartRef = useRef(onTypingStart);
  const onTypingStopRef = useRef(onTypingStop);
  onTypingStartRef.current = onTypingStart;
  onTypingStopRef.current = onTypingStop;

  // Emit typing:start on every input change (server handles timeout/debounce)
  useEffect(() => {
    if (inputMessage.trim().length > 0) {
      onTypingStartRef.current?.();
    } else {
      onTypingStopRef.current?.();
    }
  }, [inputMessage]);

  // Stop typing when component unmounts or room changes
  useEffect(() => {
    return () => {
      onTypingStopRef.current?.();
    };
  }, [currentRoom?._id]);

  // Get IDs of human (non-bot) members for read status calculation
  // Must be before early return to maintain consistent hook order
  const humanMemberIds = useMemo(() => {
    if (!currentRoom) return [];
    return currentRoom.members
      .filter(m => {
        const user = typeof m.userId === 'object' ? m.userId : null;
        return user && !user.isBot;
      })
      .map(m => {
        const user = m.userId as any;
        return user._id || user.id;
      });
  }, [currentRoom]);

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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setInputMessage(e.target.value);
  };

  return (
    <div className="room-messaging">
      <MessageList
        messages={messages}
        isRemoteTyping={(typingUsers?.size ?? 0) > 0}
        onDeleteMessage={onDeleteMessage}
        onReactMessage={onReactMessage}
        currentUserId={currentUserId}
        humanMemberIds={humanMemberIds}
        targetMessageId={targetMessageId}
        messageMode={messageMode}
        onReturnToLatest={onReturnToLatest}
        firstUnreadId={firstUnreadId}
        hasOlderUnread={hasOlderUnread}
        skippedUnreadCount={skippedUnreadCount}
        hasMoreMessages={hasMoreMessages}
        isLoadingMore={isLoadingMore}
        onLoadMore={onLoadMore}
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
        // Video
        videoRecorderState={videoRecorderState}
        videoSource={videoSource}
        videoStream={videoStream}
        videoDuration={videoDuration}
        onStartVideoRecording={onStartVideoRecording}
        onPauseVideoRecording={onPauseVideoRecording}
        onResumeVideoRecording={onResumeVideoRecording}
        onStopVideoRecording={onStopVideoRecording}
        onCancelVideoRecording={onCancelVideoRecording}
      />
    </div>
  );
};
