import React, { useState } from "react";
import { Phone, PhoneOff, Trash2, X, SmilePlus, Megaphone, Download, FileText } from "lucide-react";
import { Avatar } from "../ui/Avatar";
import { Message, Reaction, ALLOWED_EMOJIS, ReactionEmoji, UserStatus } from "../../types";
import { formatMessageTimestamp } from "../../utils/dateFormat";
import { getApiBaseUrl } from "../../services/api";
import { openUrl } from "@tauri-apps/plugin-opener";

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
  messages: Message[];
  onDelete?: (messageId: string) => void;
  onReact?: (messageId: string, emoji: string) => void;
  currentUserId?: string;
  senderStatus?: UserStatus;
  senderIsOnline?: boolean;
  senderStatusMessage?: string | null;
  roomMemberCount?: number;
}

// Helper to format file size
const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// Helper to download a file
const downloadFile = async (url: string, filename: string) => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
  } catch (error) {
    console.error('Download failed:', error);
  }
};

// URL regex pattern
const URL_REGEX = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g;

// Render text with clickable links
const renderTextWithLinks = (text: string): React.ReactNode[] => {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Reset regex state
  URL_REGEX.lastIndex = 0;

  while ((match = URL_REGEX.exec(text)) !== null) {
    // Add text before the URL
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    // Add the clickable URL
    const url = match[0];
    parts.push(
      <a
        key={`link-${match.index}`}
        href={url}
        className="message-link"
        onClick={(e) => {
          e.preventDefault();
          openUrl(url).catch(console.error);
        }}
      >
        {url}
      </a>
    );

    lastIndex = URL_REGEX.lastIndex;
  }

  // Add remaining text after last URL
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
};

export const MessageItem: React.FC<MessageItemProps> = ({
  messages,
  onDelete,
  onReact,
  currentUserId,
  senderStatus = 'available',
  senderIsOnline = false,
  senderStatusMessage = null,
  roomMemberCount = 2,
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showFullscreenImage, setShowFullscreenImage] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [fullscreenImageUrl, setFullscreenImageUrl] = useState<string | undefined>(undefined);

  // First and last message of the group
  if (!messages || messages.length === 0) {
    return null;
  }
  const firstMsg = messages[0];
  const lastMsg = messages[messages.length - 1];

  // Build full URL (handle relative URLs from server)
  const getImageUrl = (imageUrl: string | undefined): string | undefined => {
    if (!imageUrl) return undefined;
    if (imageUrl.startsWith('data:')) return imageUrl;
    if (imageUrl.startsWith('/')) return `${getApiBaseUrl()}${imageUrl}`;
    return imageUrl;
  };

  const handleDelete = async () => {
    if (!onDelete || !lastMsg.serverMessageId) return;
    setIsDeleting(true);
    try {
      await onDelete(lastMsg.serverMessageId);
    } catch (error) {
      console.error("Failed to delete message:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleReact = (emoji: string) => {
    if (!onReact || !lastMsg.serverMessageId) return;
    onReact(lastMsg.serverMessageId, emoji);
    setShowReactionPicker(false);
  };

  const handleDownloadImage = async (e: React.MouseEvent, imageUrl: string | undefined) => {
    e.stopPropagation();
    if (!imageUrl) return;
    setIsDownloading(true);
    const url = getImageUrl(imageUrl);
    if (url) {
      const filename = `organizer_${Date.now()}.jpg`;
      await downloadFile(url, filename);
    }
    setIsDownloading(false);
  };

  const handleDownloadFile = async (msg: Message) => {
    if (!msg.fileUrl) return;
    setIsDownloading(true);
    const fileUrl = getImageUrl(msg.fileUrl);
    if (fileUrl) {
      await downloadFile(fileUrl, msg.fileName || 'file');
    }
    setIsDownloading(false);
  };

  const aggregatedReactions = aggregateReactions(lastMsg.reactions);

  // Get the "best" status across all messages in the group (excluding 'read' - we calculate that separately)
  // Hierarchy: sent > sending > failed
  const getGroupStatus = () => {
    // Check for failed or sending states first
    for (const msg of messages) {
      if (msg.status === 'failed') return 'failed';
      if (msg.status === 'sending') return 'sending';
    }
    return 'sent';
  };

  // Calculate if ALL other members have read the last message (like Android does)
  const isAllRead = (() => {
    if (firstMsg.sender !== 'me') return false;
    const readByCount = lastMsg.readBy?.length || 0;
    // All other members must have read (roomMemberCount - 1 = other members)
    if (roomMemberCount > 1) {
      return readByCount >= roomMemberCount - 1;
    }
    // Fallback for unknown member count: any read = considered read
    return readByCount > 0;
  })();

  const groupStatus = firstMsg.sender === 'me' ? getGroupStatus() : null;

  // System messages (calls or announcements)
  if (firstMsg.isSystemMessage || firstMsg.type === 'system') {
    const msg = firstMsg;
    const isCallMessage = msg.systemMessageType?.includes('call');

    return (
      <div className="system-message">
        <div className="system-message-header">
          <span className={`system-message-icon ${msg.systemMessageType || 'announcement'}`}>
            {msg.systemMessageType === "missed-call" && <PhoneOff size={16} />}
            {msg.systemMessageType === "rejected-call" && <PhoneOff size={16} />}
            {msg.systemMessageType === "ended-call" && <Phone size={16} />}
            {!isCallMessage && <Megaphone size={16} />}
          </span>
          {isCallMessage && <span className="system-message-text">{msg.text || msg.content}</span>}
        </div>
        {!isCallMessage && <span className="system-message-text">{msg.text || msg.content}</span>}
        {aggregatedReactions.length > 0 && (
          <div className="reaction-bar system-message-reactions">
            {aggregatedReactions.map((r) => (
              <button
                key={r.emoji}
                className={`reaction-chip ${r.userIds.includes(currentUserId || '') ? 'active' : ''}`}
                onClick={() => handleReact(r.emoji)}
              >
                {r.emoji} {r.count}
              </button>
            ))}
          </div>
        )}
        <span className="system-message-time">
          {formatMessageTimestamp(msg.timestamp)}
        </span>
      </div>
    );
  }

  // Check if any message has failed status
  const hasFailed = messages.some(m => m.status === "failed");

  return (
    <div
      className={`message ${firstMsg.sender} ${hasFailed ? "failed" : ""}`}
    >
      {firstMsg.sender === "them" && (
        <Avatar
          name={firstMsg.senderName || "User"}
          size="sm"
          className="message-avatar"
        />
      )}
      <div className="message-content">
        {firstMsg.senderName && (
          <span className="message-sender-name">
            <span className={`status-dot ${senderIsOnline ? 'online' : 'offline'}`} />
            {firstMsg.senderName}
            <span className={`sender-status-label ${senderStatus}`}>
              {{ available: 'Disponible', busy: 'Occupé', away: 'Absent', dnd: 'Ne pas déranger' }[senderStatus] || 'Disponible'}
            </span>
            {senderStatusMessage && (
              <span className="sender-status-message">{senderStatusMessage}</span>
            )}
          </span>
        )}
        <div className="bubble">
          {messages.map((msg, idx) => (
            <React.Fragment key={msg.id}>
              {msg.image && (
                <div className="image-with-caption">
                  <img
                    src={getImageUrl(msg.image)}
                    alt="Image"
                    className="message-image"
                    onClick={() => {
                      setFullscreenImageUrl(msg.image);
                      setShowFullscreenImage(true);
                    }}
                    style={{ cursor: 'pointer' }}
                  />
                  {msg.caption && <span className="image-caption">{msg.caption}</span>}
                </div>
              )}
              {msg.audio && (
                <div className="audio-message">
                  <audio controls src={getImageUrl(msg.audio)} className="audio-player" />
                </div>
              )}
              {msg.type === 'file' && msg.fileUrl && (
                <div className="file-message" onClick={() => handleDownloadFile(msg)} style={{ cursor: 'pointer' }}>
                  <div className="file-icon">
                    <FileText size={24} />
                  </div>
                  <div className="file-info">
                    <span className="file-name">{msg.fileName || 'Fichier'}</span>
                    {msg.fileSize && <span className="file-size">{formatFileSize(msg.fileSize)}</span>}
                  </div>
                  <button className="file-download" disabled={isDownloading}>
                    {isDownloading ? '...' : <Download size={18} />}
                  </button>
                </div>
              )}
              {msg.caption && msg.type === 'file' && <span className="file-caption">{msg.caption}</span>}
              {msg.text && (
                <>
                  <span>{renderTextWithLinks(msg.text)}</span>
                  {idx < messages.length - 1 && <br />}
                </>
              )}
            </React.Fragment>
          ))}
        </div>
        {/* Message footer: timestamp + reactions + delete on ONE line */}
        <div className="message-footer">
          <span className="timestamp">
            {formatMessageTimestamp(lastMsg.timestamp)}
            {groupStatus === "sending" && " ..."}
            {groupStatus === "sent" && !isAllRead && " ✓✓"}
            {isAllRead && (
              <span className="read-status"> ✓✓ Lu</span>
            )}
            {groupStatus === "failed" && " ✗"}
          </span>
          {aggregatedReactions.map((r) => (
            <button
              key={r.emoji}
              className={`reaction-chip ${r.userIds.includes(currentUserId || '') ? 'active' : ''}`}
              onClick={() => handleReact(r.emoji)}
            >
              {r.emoji} {r.count}
            </button>
          ))}
          {lastMsg.serverMessageId && (
            <div className="reaction-add-container">
              <button
                className="reaction-add"
                onClick={() => setShowReactionPicker(!showReactionPicker)}
                title="Ajouter une réaction"
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
          {lastMsg.sender === "me" && lastMsg.serverMessageId && !isDeleting && (
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
      </div>
      {showFullscreenImage && fullscreenImageUrl && (
        <div className="image-fullscreen-overlay" onClick={() => setShowFullscreenImage(false)}>
          <button className="image-fullscreen-download" onClick={(e) => handleDownloadImage(e, fullscreenImageUrl)} title="Telecharger">
            {isDownloading ? '...' : <Download size={24} />}
          </button>
          <button className="image-fullscreen-close" onClick={() => setShowFullscreenImage(false)}>
            <X size={24} />
          </button>
          <img
            src={getImageUrl(fullscreenImageUrl)}
            alt="Image fullscreen"
            className="image-fullscreen"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};
