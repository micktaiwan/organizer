export type MemoryType = 'message' | 'note' | 'file' | 'pet_conversation' | 'fact';

export interface MemoryPayload {
  type: MemoryType;
  content: string;
  timestamp: string;

  // For messages
  roomId?: string;
  roomName?: string;
  authorId?: string;
  authorName?: string;

  // For notes
  noteId?: string;
  noteTitle?: string;

  // For files
  fileId?: string;
  fileName?: string;
  mimeType?: string;

  // For pet conversations
  participants?: string[];
  summary?: string;

  // For facts (pet memory about users)
  subjects?: string[];
  expiresAt?: string | null;
}

export interface MemoryDocument {
  id: string;
  vector: number[];
  payload: MemoryPayload;
}

export interface MemorySearchResult {
  id: string;
  score: number;
  payload: MemoryPayload;
}

export interface MemorySearchOptions {
  types?: MemoryType[];
  roomId?: string;
  authorId?: string;
  since?: Date;
  limit?: number;
}

// Input from LLM response for storing facts
export interface FactMemoryInput {
  content: string;
  subjects: string[];
  ttl: string | null; // "7d", "1h", null for permanent
}
