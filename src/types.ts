export interface Message {
  id: string;
  text?: string;
  image?: string; // base64 data URL
  audio?: string; // base64 audio data URL for voice messages
  sender: "me" | "them";
  timestamp: Date;
  status?: "sending" | "sent" | "delivered" | "read" | "failed";
  readAt?: Date; // when message was read by recipient
  isSystemMessage?: boolean;
  systemMessageType?: "missed-call" | "rejected-call" | "ended-call";
}

export interface Contact {
  id: string;
  name: string;
  peerId: string;
  createdAt: Date;
}

export type CallState = 'idle' | 'calling' | 'incoming' | 'connected';

export interface PeerMessage {
  type: string;
  id?: string;
  messageId?: string;
  text?: string;
  image?: string;
  audio?: string;
  username?: string;
  withCamera?: boolean;
  enabled?: boolean;
  readAt?: string;
}

