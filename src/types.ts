export interface Message {
  id: string;
  serverMessageId?: string; // MongoDB _id for server-synced messages
  text?: string;
  image?: string; // base64 data URL
  audio?: string; // base64 audio data URL for voice messages
  sender: "me" | "them";
  senderName?: string; // For multi-user rooms
  senderId?: string; // For identifying sender in rooms
  timestamp: Date;
  status?: "sending" | "sent" | "delivered" | "read" | "failed";
  readBy?: string[]; // Array of user IDs who read the message
  isSystemMessage?: boolean;
  systemMessageType?: "missed-call" | "rejected-call" | "ended-call";
}

export interface RoomMember {
  userId: string;
  username: string;
  displayName: string;
  isOnline: boolean;
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

export type CallState = 'idle' | 'calling' | 'incoming' | 'connected';

export type UserStatus = 'available' | 'busy' | 'away' | 'dnd';

export interface UserStatusInfo {
  status: UserStatus;
  statusMessage: string | null;
  isMuted: boolean;
}
