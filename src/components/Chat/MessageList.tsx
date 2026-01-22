import React, { useEffect, useRef, useMemo, useState } from "react";
import { ArrowDown } from "lucide-react";
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
  humanMemberIds?: string[]; // IDs of human (non-bot) members
  targetMessageId?: string | null;
  messageMode?: 'latest' | 'around';
  onReturnToLatest?: () => void;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  isRemoteTyping,
  onDeleteMessage,
  onReactMessage,
  currentUserId,
  humanMemberIds,
  targetMessageId,
  messageMode = 'latest',
  onReturnToLatest,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const { getStatus } = useUserStatus();

  // Group consecutive messages from same sender (< 1 min)
  const messageGroups = useMemo(() => groupConsecutiveMessages(messages), [messages]);

  // Find which group contains the target message
  const findGroupIndexForMessage = (msgId: string): number => {
    for (let i = 0; i < messageGroups.length; i++) {
      if (messageGroups[i].messages.some(m => m.serverMessageId === msgId || m.id === msgId)) {
        return i;
      }
    }
    return -1;
  };

  // Scroll to target message when it changes
  useEffect(() => {
    if (targetMessageId && messageMode === 'around') {
      const groupIndex = findGroupIndexForMessage(targetMessageId);
      if (groupIndex !== -1) {
        // Small delay to ensure DOM is ready
        setTimeout(() => {
          const element = containerRef.current?.querySelector(`[data-group-index="${groupIndex}"]`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setHighlightedMessageId(targetMessageId);
            // Remove highlight after animation
            setTimeout(() => setHighlightedMessageId(null), 2000);
          }
        }, 100);
      }
    }
  }, [targetMessageId, messageMode, messageGroups]);

  // Auto-scroll to bottom in latest mode
  useEffect(() => {
    if (messageMode === 'latest') {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isRemoteTyping, messageMode]);

  // Check if a message group contains the highlighted message
  const isGroupHighlighted = (group: { messages: Message[] }): boolean => {
    if (!highlightedMessageId) return false;
    return group.messages.some(m => m.serverMessageId === highlightedMessageId || m.id === highlightedMessageId);
  };

  return (
    <div className="messages" ref={containerRef}>
      {messageGroups.map((group, groupIndex) => {
        const firstMsg = group.messages[0];
        // Get sender status
        const senderId = firstMsg.sender === 'them' ? firstMsg.senderId : currentUserId;
        const senderStatusData = senderId ? getStatus(senderId) : undefined;

        // System messages (announcements, calls) should not have left/right alignment
        const isSystemMessage = firstMsg.isSystemMessage || firstMsg.type === 'system';
        const wrapperClass = isSystemMessage
          ? `message-group-wrapper system ${isGroupHighlighted(group) ? 'message-group-highlight' : ''}`
          : `message-group-wrapper ${firstMsg.sender === 'me' ? 'me' : 'them'} ${isGroupHighlighted(group) ? 'message-group-highlight' : ''}`;

        return (
          <div
            key={`group-${groupIndex}-${firstMsg.id}`}
            data-group-index={groupIndex}
            className={wrapperClass}
          >
            <MessageItem
              messages={group.messages}
              onDelete={onDeleteMessage}
              onReact={onReactMessage}
              currentUserId={currentUserId}
              senderStatus={senderStatusData?.status}
              senderIsOnline={senderStatusData?.isOnline}
              senderStatusMessage={senderStatusData?.statusMessage}
              humanMemberIds={humanMemberIds}
            />
          </div>
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

      {/* Return to latest button */}
      {messageMode === 'around' && onReturnToLatest && (
        <button className="return-to-latest-btn" onClick={onReturnToLatest}>
          <ArrowDown size={16} />
          <span>Retour au présent</span>
        </button>
      )}
    </div>
  );
};

