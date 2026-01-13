import React, { useEffect, useRef } from "react";
import { Message, UserStatus } from "../../types";
import { MessageItem } from "./MessageItem";
import { getMessageGroupingFlags } from "../../utils/messageGrouping";
import { useUserStatus } from "../../contexts/UserStatusContext";

interface MessageListProps {
  messages: Message[];
  isRemoteTyping: boolean;
  onDeleteMessage?: (messageId: string) => void;
  onReactMessage?: (messageId: string, emoji: string) => void;
  currentUserId?: string;
}

export const MessageList: React.FC<MessageListProps> = ({ messages, isRemoteTyping, onDeleteMessage, onReactMessage, currentUserId }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { getStatus } = useUserStatus();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isRemoteTyping]);

  return (
    <div className="messages">
      {messages.map((msg, index) => {
        const { isGroupedWithPrevious, isLastInGroup } = getMessageGroupingFlags(messages, index);
        // Get sender status - for "them" use senderId, for "me" use currentUserId
        const senderId = msg.sender === 'them' ? msg.senderId : currentUserId;
        const senderStatusData = senderId ? getStatus(senderId) : undefined;

        return (
          <MessageItem
            key={msg.id}
            msg={msg}
            isGroupedWithPrevious={isGroupedWithPrevious}
            isLastInGroup={isLastInGroup}
            onDelete={onDeleteMessage}
            onReact={onReactMessage}
            currentUserId={currentUserId}
            senderStatus={senderStatusData?.status}
            senderIsOnline={senderStatusData?.isOnline}
            senderStatusMessage={senderStatusData?.statusMessage}
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

