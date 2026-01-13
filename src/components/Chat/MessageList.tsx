import React, { useEffect, useRef, useMemo } from "react";
import { Message } from "../../types";
import { MessageItem } from "./MessageItem";
import { groupConsecutiveMessages } from "../../utils/messageGrouping";
import { useUserStatus } from "../../contexts/UserStatusContext";

interface MessageListProps {
  messages: Message[];
  isRemoteTyping: boolean;
  onDeleteMessage?: (messageId: string) => void;
  onReactMessage?: (messageId: string, emoji: string) => void;
  currentUserId?: string;
  roomMemberCount?: number;
}

export const MessageList: React.FC<MessageListProps> = ({ messages, isRemoteTyping, onDeleteMessage, onReactMessage, currentUserId, roomMemberCount }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { getStatus } = useUserStatus();

  // Group consecutive messages from same sender (< 1 min)
  const messageGroups = useMemo(() => groupConsecutiveMessages(messages), [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isRemoteTyping]);

  return (
    <div className="messages">
      {messageGroups.map((group, groupIndex) => {
        const firstMsg = group.messages[0];
        // Get sender status
        const senderId = firstMsg.sender === 'them' ? firstMsg.senderId : currentUserId;
        const senderStatusData = senderId ? getStatus(senderId) : undefined;

        return (
          <MessageItem
            key={`group-${groupIndex}-${firstMsg.id}`}
            messages={group.messages}
            onDelete={onDeleteMessage}
            onReact={onReactMessage}
            currentUserId={currentUserId}
            senderStatus={senderStatusData?.status}
            senderIsOnline={senderStatusData?.isOnline}
            senderStatusMessage={senderStatusData?.statusMessage}
            roomMemberCount={roomMemberCount}
          />
        );
      })}
      {isRemoteTyping && (
        <div className="typing-indicator">
          <span></span>
          <span></span>
          <span></span>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
};

