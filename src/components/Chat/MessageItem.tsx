import React, { useState } from "react";
import { Phone, PhoneOff, Trash2 } from "lucide-react";
import { Avatar } from "../ui/Avatar";
import { Message } from "../../types";
import { formatMessageTimestamp } from "../../utils/dateFormat";

interface MessageItemProps {
  msg: Message;
  onDelete?: (messageId: string) => void;
}

export const MessageItem: React.FC<MessageItemProps> = ({ msg, onDelete }) => {
  const [isDeleting, setIsDeleting] = useState(false);

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

  if (msg.isSystemMessage) {
    return (
      <div className="system-message">
        <span className={`system-message-icon ${msg.systemMessageType}`}>
          {msg.systemMessageType === "missed-call" && <PhoneOff size={16} />}
          {msg.systemMessageType === "rejected-call" && <PhoneOff size={16} />}
          {msg.systemMessageType === "ended-call" && <Phone size={16} />}
        </span>
        <span className="system-message-text">{msg.text}</span>
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
          {msg.image && <img src={msg.image} alt="Image" className="message-image" />}
          {msg.audio && (
            <div className="audio-message">
              <audio controls src={msg.audio} className="audio-player" />
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
    </div>
  );
};
