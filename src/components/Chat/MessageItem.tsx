import React, { useState } from "react";
import { Phone, PhoneOff, Trash2, X, SmilePlus, Megaphone } from "lucide-react";
import { Avatar } from "../ui/Avatar";
import { Message, Reaction, ALLOWED_EMOJIS, ReactionEmoji } from "../../types";
import { formatMessageTimestamp } from "../../utils/dateFormat";
import { getApiBaseUrl } from "../../services/api";

interface ReactionCount {
  emoji: ReactionEmoji;
  count: number;
  userIds: string[];
}

// Aggregate reactions by emoji
const aggregateReactions = (reactions: Reaction[] | undefined): ReactionCount[] => {
  if (!reactions || reactions.length === 0) return [];

  const map = new Map<ReactionEmoji, { count: number; userIds: string[] }>();
  reactions.forEach(r => {
    const existing = map.get(r.emoji) || { count: 0, userIds: [] };
    existing.count++;
    existing.userIds.push(r.userId);
    map.set(r.emoji, existing);
  });

  return Array.from(map.entries()).map(([emoji, data]) => ({
    emoji,
    count: data.count,
    userIds: data.userIds,
  }));
};

interface MessageItemProps {
  msg: Message;
  onDelete?: (messageId: string) => void;
  onReact?: (messageId: string, emoji: string) => void;
  currentUserId?: string;
}

export const MessageItem: React.FC<MessageItemProps> = ({ msg, onDelete, onReact, currentUserId }) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showFullscreenImage, setShowFullscreenImage] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);

  // Build full image URL (handle relative URLs from server)
  const getImageUrl = (imageUrl: string | undefined): string | undefined => {
    if (!imageUrl) return undefined;
    // If it's a data URL (base64), return as-is
    if (imageUrl.startsWith('data:')) return imageUrl;
    // If it's a relative URL from server, prefix with API base URL
    if (imageUrl.startsWith('/')) return `${getApiBaseUrl()}${imageUrl}`;
    // Otherwise, return as-is (full URL)
    return imageUrl;
  };

  const handleDelete = async () => {
    if (!onDelete || !msg.serverMessageId) return;
    setIsDeleting(true);
    try {
      await onDelete(msg.serverMessageId);
    } catch (error) {
      console.error("Failed to delete message:", error);
      setIsDeleting(false);
    }
  };

  const handleReact = (emoji: string) => {
    if (!onReact || !msg.serverMessageId) return;
    onReact(msg.serverMessageId, emoji);
    setShowReactionPicker(false);
  };

  const aggregatedReactions = aggregateReactions(msg.reactions);

  // System messages (calls or announcements)
  if (msg.isSystemMessage || msg.type === 'system') {
    const isCallMessage = msg.systemMessageType?.includes('call');

    return (
      <div className="system-message">
        <span className={`system-message-icon ${msg.systemMessageType || 'announcement'}`}>
          {msg.systemMessageType === "missed-call" && <PhoneOff size={16} />}
          {msg.systemMessageType === "rejected-call" && <PhoneOff size={16} />}
          {msg.systemMessageType === "ended-call" && <Phone size={16} />}
          {!isCallMessage && <Megaphone size={16} />}
        </span>
        <span className="system-message-text">{msg.text || msg.content}</span>
        <span className="system-message-time">
          {formatMessageTimestamp(msg.timestamp)}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`message ${msg.sender} ${msg.status === "failed" ? "failed" : ""}`}
    >
      {msg.sender === "them" && (
        <Avatar
          name={msg.senderName || "User"}
          size="sm"
          className="message-avatar"
        />
      )}
      <div className="message-content">
        {msg.sender === "them" && msg.senderName && (
          <span className="message-sender-name">{msg.senderName}</span>
        )}
        <div className="bubble">
          {msg.image && (
            <img
              src={getImageUrl(msg.image)}
              alt="Image"
              className="message-image"
              onClick={() => setShowFullscreenImage(true)}
              style={{ cursor: 'pointer' }}
            />
          )}
          {msg.audio && (
            <div className="audio-message">
              <audio controls src={getImageUrl(msg.audio)} className="audio-player" />
            </div>
          )}
          {msg.text && <span>{msg.text}</span>}
        </div>
        <span className="timestamp">
          {formatMessageTimestamp(msg.timestamp)}
          {msg.sender === "me" && msg.status === "sending" && " ..."}
          {msg.sender === "me" && msg.status === "sent" && " ✓"}
          {msg.sender === "me" && msg.status === "delivered" && " ✓✓"}
          {msg.sender === "me" && msg.status === "read" && (
            <span className="read-status">
              {" ✓✓ Lu"}
            </span>
          )}
          {msg.sender === "me" && msg.status === "failed" && " ✗"}
        </span>
        {/* Reaction Bar */}
        {(aggregatedReactions.length > 0 || msg.serverMessageId) && (
          <div className="reaction-bar">
            {aggregatedReactions.map((r) => (
              <button
                key={r.emoji}
                className={`reaction-chip ${r.userIds.includes(currentUserId || '') ? 'active' : ''}`}
                onClick={() => handleReact(r.emoji)}
              >
                {r.emoji} {r.count}
              </button>
            ))}
            {msg.serverMessageId && (
              <div className="reaction-add-container">
                <button
                  className="reaction-add"
                  onClick={() => setShowReactionPicker(!showReactionPicker)}
                  title="Ajouter une reaction"
                >
                  <SmilePlus size={14} />
                </button>
                {showReactionPicker && (
                  <div className="reaction-picker">
                    {ALLOWED_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        className="reaction-picker-emoji"
                        onClick={() => handleReact(emoji)}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      {msg.sender === "me" && msg.serverMessageId && !isDeleting && (
        <button
          className="message-delete-btn"
          onClick={handleDelete}
          title="Supprimer le message"
        >
          <Trash2 size={14} />
        </button>
      )}
      {isDeleting && (
        <span className="message-deleting">...</span>
      )}
      {showFullscreenImage && msg.image && (
        <div className="image-fullscreen-overlay" onClick={() => setShowFullscreenImage(false)}>
          <button className="image-fullscreen-close" onClick={() => setShowFullscreenImage(false)}>
            <X size={24} />
          </button>
          <img
            src={getImageUrl(msg.image)}
            alt="Image fullscreen"
            className="image-fullscreen"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};
