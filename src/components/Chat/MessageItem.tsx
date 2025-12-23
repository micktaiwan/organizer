import React from "react";
import { Message } from "../../types";

interface MessageItemProps {
  msg: Message;
}

export const MessageItem: React.FC<MessageItemProps> = ({ msg }) => {
  if (msg.isSystemMessage) {
    return (
      <div className="system-message">
        <span className={`system-message-icon ${msg.systemMessageType}`}>
          {msg.systemMessageType === "missed-call" && "📵"}
          {msg.systemMessageType === "rejected-call" && "📵"}
          {msg.systemMessageType === "ended-call" && "📞"}
        </span>
        <span className="system-message-text">{msg.text}</span>
        <span className="system-message-time">
          {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    );
  }

  return (
    <div className={`message ${msg.sender} ${msg.status === "failed" ? "failed" : ""}`}>
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
        {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        {msg.sender === "me" && msg.status === "sending" && " ..."}
        {msg.sender === "me" && msg.status === "sent" && " ✓"}
        {msg.sender === "me" && msg.status === "delivered" && " ✓✓"}
        {msg.sender === "me" && msg.status === "read" && (
          <span className="read-status">
            {" ✓✓ Lu à "}{msg.readAt ? msg.readAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
          </span>
        )}
        {msg.sender === "me" && msg.status === "failed" && " ✗"}
      </span>
    </div>
  );
};

