export type ReactionEmoji = '👍' | '❤️' | '😂' | '😮' | '😢' | '😡' | '✅' | '⚠️' | '🙏' | '🎉' | '👋' | '😘';
export type ClientSource = 'desktop' | 'android' | 'api';

export const ALLOWED_EMOJIS: ReactionEmoji[] = ['👍', '❤️', '😂', '😮', '😢', '😡', '✅', '⚠️', '🙏', '🎉', '👋', '😘'];

export interface Reaction {
  userId: string;
  emoji: ReactionEmoji;
  createdAt: Date;
}

export interface Message {
  id: string;
  serverMessageId?: string; // MongoDB _id for server-synced messages
  text?: string;
  content?: string; // Alternative content field from server
  type?: "text" | "image" | "audio" | "system" | "file" | "video"; // Message type from server
  image?: string; // base64 data URL
  caption?: string; // Optional caption for image/file messages
  audio?: string; // base64 audio data URL for voice messages
  fileUrl?: string; // URL for file messages
  fileName?: string; // Original filename for file messages
  fileSize?: number; // File size in bytes
  mimeType?: string; // MIME type for file messages
  // Video-specific fields
  videoUrl?: string; // URL for video messages
  thumbnailUrl?: string | null; // URL for video thumbnail (null until generated)
  duration?: number; // Video duration in seconds
  width?: number; // Video width in pixels
  height?: number; // Video height in pixels
  sender: "me" | "them";
  senderName?: string; // For multi-user rooms
  senderId?: string; // For identifying sender in rooms
  timestamp: Date;
  status?: "sending" | "sent" | "delivered" | "read" | "failed";
  readBy?: string[]; // Array of user IDs who read the message
  reactions?: Reaction[]; // Array of reactions on the message
  clientSource?: ClientSource; // Source client: desktop, android, or api
  isSystemMessage?: boolean;
  systemMessageType?: "missed-call" | "rejected-call" | "ended-call";
}

export interface RoomMember {
  userId: string;
  username: string;
  displayName: string;
  isOnline: boolean;
  isBot?: boolean;
  status?: UserStatus;
  statusMessage?: string | null;
  isMuted?: boolean;
  joinedAt: Date;
  lastReadAt: Date | null;
}

export interface Room {
  id: string;
  name: string;
  type: 'lobby' | 'public' | 'private';
  members: RoomMember[];
  createdBy: string;
  isLobby: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Contact {
  id: string;
  name: string;
  peerId?: string; // DEPRECATED: Use userId instead
  userId?: string; // MongoDB user ID
  createdAt: Date;
}

export type CallState = 'idle' | 'calling' | 'incoming' | 'connected' | 'reconnecting';

export type UserStatus = 'available' | 'busy' | 'away' | 'dnd';

export interface UserStatusInfo {
  status: UserStatus;
  statusMessage: string | null;
  isMuted: boolean;
}

// Notes types
export interface ChecklistItem {
  _id: string;
  text: string;
  checked: boolean;
  order: number;
}

export interface Label {
  _id: string;
  name: string;
  color: string;
}

export interface NoteUser {
  _id: string;
  username: string;
  displayName?: string;
}

export interface Note {
  _id: string;
  type: 'note' | 'checklist';
  title: string;
  content: string;
  items: ChecklistItem[];
  color: string;
  labels: Label[];
  assignedTo: NoteUser | null;
  createdBy: NoteUser;
  order: number;
  isPinned: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

// Eko Reflection types
export interface EkoRateLimits {
  lastMessageAt: string | null;
  cooldownMinutes: number;
  maxPerDay: number;
  todayCount: number;
  canIntervene: boolean;
  cooldownRemaining?: number;
}

export interface EkoReflectionEntry {
  id: string;
  timestamp: string;
  action: 'pass' | 'message';
  reason: string;
  message?: string;
  roomName?: string;
  durationMs: number;
  rateLimited?: boolean;
  inputTokens?: number;
  outputTokens?: number;
}

export interface EkoStats {
  totalReflections: number;
  passCount: number;
  messageCount: number;
  rateLimitedCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  lastMessageAt: string | null;
  history: EkoReflectionEntry[];
  rateLimits: EkoRateLimits;
}
