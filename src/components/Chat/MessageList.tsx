import React, { useEffect, useRef } from "react";
import { Message } from "../../types";
import { MessageItem } from "./MessageItem";

interface MessageListProps {
  messages: Message[];
  isRemoteTyping: boolean;
}

export const MessageList: React.FC<MessageListProps> = ({ messages, isRemoteTyping }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isRemoteTyping]);

  return (
    <div className="messages">
      {messages.map((msg) => (
        <MessageItem key={msg.id} msg={msg} />
      ))}
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

