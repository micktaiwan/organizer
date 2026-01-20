import React, { useState, useEffect, useMemo } from "react";
import { Phone, PhoneOff, Trash2, X, SmilePlus, Megaphone, Download, FileText, Monitor, Smartphone, Bot, CheckCircle, Check } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { Avatar } from "../ui/Avatar";
import { Message, Reaction, ALLOWED_EMOJIS, ReactionEmoji, UserStatus } from "../../types";
import { formatMessageTimestamp } from "../../utils/dateFormat";
import { getApiBaseUrl } from "../../services/api";
import { openUrl } from "@tauri-apps/plugin-opener";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";

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
  humanMemberIds?: string[]; // IDs of human (non-bot) members
}

// Helper to format file size
const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// Helper to download a file using Tauri APIs
const downloadFile = async (url: string, filename: string) => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Get file extension for filter
    const ext = filename.split('.').pop() || 'jpg';

    // Open save dialog
    const filePath = await save({
      defaultPath: filename,
      filters: [{ name: 'Image', extensions: [ext] }]
    });

    if (filePath) {
      await writeFile(filePath, uint8Array);
    }
  } catch (error) {
    console.error('Download failed:', error);
  }
};

// Markdown text component with clickable links
const MarkdownText: React.FC<{ text: string }> = ({ text }) => {
  // Memoize components to prevent recreation on every render
  const components = useMemo(() => ({
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
      <a
        href={href}
        className="message-link"
        onClick={(e) => {
          e.preventDefault();
          if (href) openUrl(href).catch(console.error);
        }}
      >
        {children}
      </a>
    ),
    code: ({ className, children }: { className?: string; children?: React.ReactNode }) => {
      // Check if it's a code block (has language class) vs inline code
      const isCodeBlock = className?.startsWith('language-');
      if (isCodeBlock) {
        return (
          <pre className="code-block">
            <code className={className}>{children}</code>
          </pre>
        );
      }
      return <code className="inline-code">{children}</code>;
    },
    pre: ({ children }: { children?: React.ReactNode }) => {
      // The pre tag wraps code blocks from react-markdown, we handle formatting in code component
      return <>{children}</>;
    },
    p: ({ children }: { children?: React.ReactNode }) => (
      <p className="markdown-paragraph">{children}</p>
    ),
  }), []);

  return (
    <ReactMarkdown components={components} remarkPlugins={[remarkGfm, remarkBreaks]}>
      {text}
    </ReactMarkdown>
  );
};

export const MessageItem: React.FC<MessageItemProps> = ({
  messages,
  onDelete,
  onReact,
  currentUserId,
  senderStatus = 'available',
  senderIsOnline = false,
  senderStatusMessage = null,
  humanMemberIds = [],
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showFullscreenImage, setShowFullscreenImage] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [fullscreenImageUrl, setFullscreenImageUrl] = useState<string | undefined>(undefined);

  // Close fullscreen image on Escape key
  useEffect(() => {
    if (!showFullscreenImage) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowFullscreenImage(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showFullscreenImage]);

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

  // Calculate if ALL other human members have read the last message
  const isAllRead = (() => {
    if (firstMsg.sender !== 'me') return false;
    if (!currentUserId || humanMemberIds.length === 0) return false;

    const readBy = lastMsg.readBy || [];
    // Get other human members (excluding the sender)
    const otherHumanMembers = humanMemberIds.filter(id => id !== currentUserId);

    if (otherHumanMembers.length === 0) return false;

    // Check if ALL other human members have read the message
    return otherHumanMembers.every(memberId => readBy.includes(memberId));
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
            {firstMsg.senderName.toLowerCase() === 'eko' ? (
              <>
                <Bot size={14} className="eko-icon" />
                <span className="eko-name">Eko</span>
              </>
            ) : (
              <>
                <span className={`status-dot ${senderIsOnline ? 'online' : 'offline'}`} />
                {firstMsg.senderName}
                <span className={`sender-status-label ${senderStatus}`}>
                  {{ available: 'Disponible', busy: 'Occupé', away: 'Absent', dnd: 'Ne pas déranger' }[senderStatus] || 'Disponible'}
                </span>
                {senderStatusMessage && (
                  <span className="sender-status-message">{senderStatusMessage}</span>
                )}
              </>
            )}
          </span>
        )}
        <div className="bubble">
          {messages.map((msg) => (
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
                <div className="message-text-content">
                  <MarkdownText text={msg.text} />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
        {/* Message footer: timestamp + reactions + delete on ONE line */}
        <div className="message-footer">
          <span className="timestamp">
            {formatMessageTimestamp(lastMsg.timestamp)}
            {groupStatus === "sending" && " ..."}
            {groupStatus === "sent" && !isAllRead && <Check size={12} className="sent-icon" />}
            {isAllRead && <CheckCircle size={12} className="read-icon" />}
            {groupStatus === "failed" && " ✗"}
            {lastMsg.clientSource === 'desktop' && <Monitor size={12} className="client-icon" />}
            {lastMsg.clientSource === 'android' && <Smartphone size={12} className="client-icon" />}
            {lastMsg.clientSource === 'api' && <Bot size={12} className="client-icon" />}
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
