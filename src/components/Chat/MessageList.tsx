import React, { useEffect, useRef } from "react";
import { Message } from "../../types";
import { MessageItem } from "./MessageItem";
import { getMessageGroupingFlags } from "../../utils/messageGrouping";

interface MessageListProps {
  messages: Message[];
  isRemoteTyping: boolean;
  onDeleteMessage?: (messageId: string) => void;
  onReactMessage?: (messageId: string, emoji: string) => void;
  currentUserId?: string;
}

export const MessageList: React.FC<MessageListProps> = ({ messages, isRemoteTyping, onDeleteMessage, onReactMessage, currentUserId }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isRemoteTyping]);

  return (
    <div className="messages">
      {messages.map((msg, index) => {
        const { isGroupedWithPrevious, isLastInGroup } = getMessageGroupingFlags(messages, index);
        return (
          <MessageItem
            key={msg.id}
            msg={msg}
            isGroupedWithPrevious={isGroupedWithPrevious}
            isLastInGroup={isLastInGroup}
            onDelete={onDeleteMessage}
            onReact={onReactMessage}
            currentUserId={currentUserId}
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

