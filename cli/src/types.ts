// User types
export type UserStatus = 'available' | 'busy' | 'away' | 'dnd';

export interface User {
  id: string;
  _id?: string;
  username: string;
  displayName: string;
  email: string;
  isOnline?: boolean;
  isAdmin?: boolean;
  isBot?: boolean;
  lastSeen?: string;
  status?: UserStatus;
  statusMessage?: string | null;
  isMuted?: boolean;
}

// Room types
export type RoomType = 'lobby' | 'public' | 'private';

export interface RoomMember {
  userId: string;
  username: string;
  displayName: string;
  isOnline: boolean;
  isBot?: boolean;
  status?: UserStatus;
  statusMessage?: string | null;
  isMuted?: boolean;
  joinedAt: string;
  lastReadAt: string | null;
}

export interface Room {
  _id: string;
  name: string;
  type: RoomType;
  members: RoomMember[];
  createdBy: string | User;
  isLobby: boolean;
  createdAt: string;
  updatedAt: string;
  lastMessageAt?: string;
  unreadCount?: number;
}

// Message types
export type MessageType = 'text' | 'image' | 'audio' | 'system' | 'file' | 'video';
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
export type ClientSource = 'desktop' | 'android' | 'api';

// Helper to get user ID consistently
export function getUserId(user: User | string | null | undefined): string {
  if (!user) return '';
  if (typeof user === 'string') return user;
  return user._id || user.id || '';
}

export interface Reaction {
  userId: string;
  emoji: string;
  createdAt: string;
}

export interface Message {
  _id: string;
  roomId: string;
  senderId: string | User;
  type: MessageType;
  content: string;
  caption?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  status: MessageStatus;
  readBy: string[];
  reactions?: Reaction[];
  clientSource?: ClientSource;
  createdAt: string;
}

// Auth types
export interface AuthResponse {
  token: string;
  user: User;
}

export interface StoredCredentials {
  token: string;
  user: User;
  server: string;
}

// Socket event payloads
export interface TypingEvent {
  from: string;
  roomId: string;
}

export interface UnreadEvent {
  roomId: string;
  unreadCount: number;
}

export interface UserOnlineEvent {
  userId: string;
  status: UserStatus;
  statusMessage: string | null;
  isMuted: boolean;
  isBot: boolean;
  roomId?: string;
}

export interface UserOfflineEvent {
  userId: string;
  roomId?: string;
}

export interface UsersInitEvent {
  users: Array<{
    id: string;
    username: string;
    displayName: string;
    status: UserStatus;
    statusMessage: string | null;
    isMuted: boolean;
    isOnline: boolean;
    isBot: boolean;
  }>;
}
