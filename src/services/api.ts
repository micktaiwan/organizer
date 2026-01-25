let apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function setApiBaseUrl(url: string) {
  apiBaseUrl = url.replace(/\/$/, '');
}

export function getApiBaseUrl(): string {
  return apiBaseUrl;
}

interface ApiError {
  error: string;
  details?: unknown;
}

interface User {
  id: string;
  _id?: string; // MongoDB ObjectId (present when populated)
  username: string;
  displayName: string;
  email: string;
  isOnline?: boolean;
  isAdmin?: boolean;
  isBot?: boolean;
  lastSeen?: string;
  peerId?: string | null;
  status?: 'available' | 'busy' | 'away' | 'dnd';
  statusMessage?: string | null;
  statusExpiresAt?: string | null;
  isMuted?: boolean;
}

interface AdminStats {
  totalUsers: number;
  onlineUsers: number;
  totalContacts: number;
  totalMessages: number;
}

interface AdminUser {
  _id: string;
  username: string;
  displayName: string;
  email: string;
  isOnline: boolean;
  isAdmin: boolean;
  lastSeen: string;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

// Notes types
interface NoteUser {
  _id: string;
  username: string;
  displayName?: string;
}

interface ChecklistItem {
  _id: string;
  text: string;
  checked: boolean;
  order: number;
}

interface Label {
  _id: string;
  name: string;
  color: string;
}

interface Note {
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

interface CreateNoteRequest {
  type?: 'note' | 'checklist';
  title?: string;
  content?: string;
  items?: { text: string }[];
  color?: string;
  labels?: string[];
  assignedTo?: string | null;
}

interface UpdateNoteRequest {
  type?: 'note' | 'checklist';
  title?: string;
  content?: string;
  items?: { _id?: string; text: string; checked?: boolean; order: number }[];
  color?: string;
  labels?: string[];
  assignedTo?: string | null;
  isPinned?: boolean;
  isArchived?: boolean;
}

interface AuthResponse {
  token: string;
  user: User;
}

interface Contact {
  id: string;
  nickname: string | null;
  user: User;
  createdAt: string;
}

interface Reaction {
  userId: string;
  emoji: string;
  createdAt: string;
}

interface Message {
  _id: string;
  roomId: string;
  senderId: string | User;
  type: 'text' | 'image' | 'audio' | 'system' | 'file' | 'video';
  content: string;
  caption?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  status: 'sent' | 'delivered' | 'read';
  readBy: string[];
  reactions?: Reaction[];
  clientSource?: 'desktop' | 'android' | 'api';
  createdAt: string;
}

interface RoomMember {
  userId: User;
  joinedAt: string;
  lastReadAt: string | null;
}

interface Room {
  _id: string;
  name: string;
  type: 'lobby' | 'public' | 'private';
  members: RoomMember[];
  createdBy: string | User;
  isLobby: boolean;
  createdAt: string;
  updatedAt: string;
  lastMessageAt?: string;
}

class ApiService {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(`${apiBaseUrl}${endpoint}`, {
        ...options,
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error((data as ApiError).error || 'Une erreur est survenue');
      }

      return data as T;
    } catch (error) {
      // Si c'est une erreur réseau (pas une erreur HTTP)
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Impossible de se connecter au serveur. Vérifiez votre connexion internet.');
      }
      // Sinon, relancer l'erreur originale
      throw error;
    }
  }

  private async uploadRequest<T>(
    endpoint: string,
    formData: FormData
  ): Promise<T> {
    const headers: HeadersInit = {};

    if (this.token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${this.token}`;
    }

    // NOTE: Don't set Content-Type header - browser sets it with boundary for multipart

    const response = await fetch(`${apiBaseUrl}${endpoint}`, {
      method: 'POST',
      headers,
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error((data as ApiError).error || 'Une erreur est survenue');
    }

    return data as T;
  }

  // Auth
  async register(username: string, displayName: string, email: string, password: string): Promise<AuthResponse> {
    return this.request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, displayName, email, password }),
    });
  }

  async login(username: string, password: string): Promise<AuthResponse> {
    return this.request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  }

  async getMe(): Promise<{ user: User }> {
    return this.request<{ user: User }>('/auth/me');
  }

  // Users
  async getUser(id: string): Promise<{ user: User }> {
    return this.request<{ user: User }>(`/users/${id}`);
  }

  async updateProfile(displayName: string): Promise<{ user: User }> {
    return this.request<{ user: User }>('/users/me', {
      method: 'PATCH',
      body: JSON.stringify({ displayName }),
    });
  }

  async updateStatus(status?: string, statusMessage?: string | null, isMuted?: boolean, expiresAt?: string | null): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>('/users/status', {
      method: 'PUT',
      body: JSON.stringify({ status, statusMessage, isMuted, expiresAt }),
    });
  }

  // Contacts
  async getContacts(): Promise<{ contacts: Contact[] }> {
    return this.request<{ contacts: Contact[] }>('/contacts');
  }

  async addContact(contactId: string, nickname?: string): Promise<{ contact: Contact }> {
    return this.request<{ contact: Contact }>('/contacts', {
      method: 'POST',
      body: JSON.stringify({ contactId, nickname }),
    });
  }

  async updateContact(id: string, nickname: string | null): Promise<{ contact: Contact }> {
    return this.request<{ contact: Contact }>(`/contacts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ nickname }),
    });
  }

  async deleteContact(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/contacts/${id}`, {
      method: 'DELETE',
    });
  }

  // Rooms
  async getRooms(): Promise<{ rooms: Room[] }> {
    return this.request<{ rooms: Room[] }>('/rooms');
  }

  async getRoom(roomId: string): Promise<{ room: Room }> {
    return this.request<{ room: Room }>(`/rooms/${roomId}`);
  }

  async createRoom(name: string, type: 'public' | 'private', memberIds?: string[]): Promise<{ room: Room }> {
    return this.request<{ room: Room }>('/rooms', {
      method: 'POST',
      body: JSON.stringify({ name, type, memberIds }),
    });
  }

  async joinRoom(roomId: string): Promise<{ room: Room }> {
    return this.request<{ room: Room }>(`/rooms/${roomId}/join`, {
      method: 'POST',
    });
  }

  async leaveRoom(roomId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/rooms/${roomId}/leave`, {
      method: 'POST',
    });
  }

  async deleteRoom(roomId: string): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(`/rooms/${roomId}`, {
      method: 'DELETE',
    });
  }

  async getRoomMessages(roomId: string, limit = 50, before?: string): Promise<{ messages: Message[] }> {
    let url = `/rooms/${roomId}/messages?limit=${limit}`;
    if (before) url += `&before=${encodeURIComponent(before)}`;
    return this.request<{ messages: Message[] }>(url);
  }

  async searchRoomMessages(roomId: string, query: string, limit = 20): Promise<{ results: Message[]; total: number }> {
    return this.request<{ results: Message[]; total: number }>(
      `/rooms/${roomId}/search?q=${encodeURIComponent(query)}&limit=${limit}`
    );
  }

  async getMessagesAround(roomId: string, timestamp: string, limit = 50): Promise<{
    messages: Message[];
    hasOlder: boolean;
    hasNewer: boolean;
    targetMessageId: string | null;
  }> {
    return this.request<{
      messages: Message[];
      hasOlder: boolean;
      hasNewer: boolean;
      targetMessageId: string | null;
    }>(`/rooms/${roomId}/messages/around?timestamp=${encodeURIComponent(timestamp)}&limit=${limit}`);
  }

  async getUnreadMessages(roomId: string): Promise<{
    messages: Message[];
    firstUnreadId: string | null;
    hasOlderUnread: boolean;
    totalUnread: number;
    skippedUnread: number;
  }> {
    return this.request<{
      messages: Message[];
      firstUnreadId: string | null;
      hasOlderUnread: boolean;
      totalUnread: number;
      skippedUnread: number;
    }>(`/rooms/${roomId}/messages/unread`);
  }

  async getMessage(messageId: string): Promise<{ message: Message }> {
    return this.request<{ message: Message }>(`/messages/${messageId}`);
  }

  // Messages
  async sendMessage(roomId: string, type: string, text?: string, audio?: string, imageBlob?: Blob | null, caption?: string): Promise<{ message: Message }> {
    // Images always use multipart upload
    if (type === 'image' && imageBlob) {
      const formData = new FormData();
      formData.append('roomId', roomId);
      formData.append('image', imageBlob, 'image.jpg');
      formData.append('clientSource', 'desktop');
      if (caption) {
        formData.append('caption', caption);
      }
      return this.uploadRequest<{ message: Message }>('/upload/image', formData);
    }

    // Text and audio use JSON
    const content = audio || text || '';
    return this.request<{ message: Message }>('/messages', {
      method: 'POST',
      body: JSON.stringify({ roomId, type, content, clientSource: 'desktop' }),
    });
  }

  async uploadFile(roomId: string, file: File, caption?: string): Promise<{ message: Message }> {
    const formData = new FormData();
    formData.append('roomId', roomId);
    formData.append('file', file, file.name);
    formData.append('clientSource', 'desktop');
    if (caption) {
      formData.append('caption', caption);
    }

    return this.uploadRequest<{ message: Message }>('/upload/file', formData);
  }

  async uploadVideo(roomId: string, videoBlob: Blob, caption?: string): Promise<{ message: Message }> {
    // Determine correct extension based on actual MIME type
    // Safari/WebKit records as MP4, Chrome/Firefox as WebM
    const ext = videoBlob.type.includes('mp4') || videoBlob.type.includes('quicktime') ? 'mp4' : 'webm';

    const formData = new FormData();
    formData.append('roomId', roomId);
    formData.append('video', videoBlob, `recording-${Date.now()}.${ext}`);
    formData.append('clientSource', 'desktop');
    if (caption) {
      formData.append('caption', caption);
    }

    return this.uploadRequest<{ message: Message }>('/upload/video', formData);
  }

  uploadVideoWithProgress(
    roomId: string,
    videoBlob: Blob,
    caption: string | undefined,
    onProgress: (progress: number) => void
  ): Promise<{ message: Message }> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const ext = videoBlob.type.includes('mp4') || videoBlob.type.includes('quicktime') ? 'mp4' : 'webm';

      const formData = new FormData();
      formData.append('roomId', roomId);
      formData.append('video', videoBlob, `recording-${Date.now()}.${ext}`);
      formData.append('clientSource', 'desktop');
      if (caption) {
        formData.append('caption', caption);
      }

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          try {
            const errorData = JSON.parse(xhr.responseText);
            reject(new Error(errorData.error || `Upload failed: ${xhr.status}`));
          } catch {
            reject(new Error(`Upload failed: ${xhr.status}`));
          }
        }
      };

      xhr.onerror = () => reject(new Error('Network error'));

      xhr.open('POST', `${apiBaseUrl}/upload/video`);
      if (this.token) {
        xhr.setRequestHeader('Authorization', `Bearer ${this.token}`);
      }
      xhr.send(formData);
    });
  }

  async markMessageAsRead(id: string): Promise<{ message: Message }> {
    return this.request<{ message: Message }>(`/messages/${id}/read`, {
      method: 'PATCH',
    });
  }

  async markMessagesAsRead(messageIds: string[], roomId?: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>('/messages/read-bulk', {
      method: 'POST',
      body: JSON.stringify({ messageIds, roomId }),
    });
  }

  async markRoomAsRead(roomId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/rooms/${roomId}/read`, {
      method: 'POST',
    });
  }

  async deleteMessage(id: string): Promise<{ success: boolean; roomId: string; messageId: string }> {
    return this.request<{ success: boolean; roomId: string; messageId: string }>(`/messages/${id}`, {
      method: 'DELETE',
    });
  }

  async reactToMessage(messageId: string, emoji: string): Promise<{ message: Message; action: string; roomId: string }> {
    return this.request<{ message: Message; action: string; roomId: string }>(`/messages/${messageId}/react`, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    });
  }

  // Admin
  async getAdminStats(): Promise<{ stats: AdminStats; recentUsers: AdminUser[] }> {
    return this.request<{ stats: AdminStats; recentUsers: AdminUser[] }>('/admin/stats');
  }

  async getAdminUsers(page = 1, limit = 20): Promise<{ users: AdminUser[]; pagination: Pagination }> {
    return this.request<{ users: AdminUser[]; pagination: Pagination }>(`/admin/users?page=${page}&limit=${limit}`);
  }

  async getAdminUser(id: string): Promise<{ user: AdminUser; stats: { contactsCount: number; messagesCount: number } }> {
    return this.request<{ user: AdminUser; stats: { contactsCount: number; messagesCount: number } }>(`/admin/users/${id}`);
  }

  async updateAdminUser(id: string, data: { displayName?: string; isAdmin?: boolean }): Promise<{ user: AdminUser }> {
    return this.request<{ user: AdminUser }>(`/admin/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteAdminUser(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/admin/users/${id}`, {
      method: 'DELETE',
    });
  }

  async getAdminMessagesStats(): Promise<{ totalMessages: number; todayMessages: number; messagesByType: Record<string, number> }> {
    return this.request<{ totalMessages: number; todayMessages: number; messagesByType: Record<string, number> }>('/admin/messages/stats');
  }

  // Notes
  async getNotes(archived = false, labelId?: string): Promise<{ notes: Note[] }> {
    let url = `/notes?archived=${archived}`;
    if (labelId) url += `&labelId=${labelId}`;
    return this.request<{ notes: Note[] }>(url);
  }

  async getNote(noteId: string): Promise<{ note: Note }> {
    return this.request<{ note: Note }>(`/notes/${noteId}`);
  }

  async createNote(data: CreateNoteRequest): Promise<{ note: Note }> {
    return this.request<{ note: Note }>('/notes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateNote(noteId: string, data: UpdateNoteRequest): Promise<{ note: Note }> {
    return this.request<{ note: Note }>(`/notes/${noteId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async patchNote(noteId: string, data: Partial<UpdateNoteRequest>): Promise<{ note: Note }> {
    return this.request<{ note: Note }>(`/notes/${noteId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteNote(noteId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/notes/${noteId}`, {
      method: 'DELETE',
    });
  }

  async reorderNote(noteId: string, newOrder: number): Promise<{ note: Note }> {
    return this.request<{ note: Note }>('/notes/reorder', {
      method: 'POST',
      body: JSON.stringify({ noteId, newOrder }),
    });
  }

  // Checklist items
  async addChecklistItem(noteId: string, text: string): Promise<{ note: Note }> {
    return this.request<{ note: Note }>(`/notes/${noteId}/items`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  }

  async updateChecklistItem(noteId: string, itemId: string, data: { text?: string; checked?: boolean }): Promise<{ note: Note }> {
    return this.request<{ note: Note }>(`/notes/${noteId}/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteChecklistItem(noteId: string, itemId: string): Promise<{ note: Note }> {
    return this.request<{ note: Note }>(`/notes/${noteId}/items/${itemId}`, {
      method: 'DELETE',
    });
  }

  async reorderChecklistItems(noteId: string, items: { _id: string; order: number }[]): Promise<{ note: Note }> {
    return this.request<{ note: Note }>(`/notes/${noteId}/items/reorder`, {
      method: 'POST',
      body: JSON.stringify({ items }),
    });
  }

  // Labels
  async getLabels(): Promise<{ labels: Label[] }> {
    return this.request<{ labels: Label[] }>('/labels');
  }

  async createLabel(name: string, color?: string): Promise<{ label: Label }> {
    return this.request<{ label: Label }>('/labels', {
      method: 'POST',
      body: JSON.stringify({ name, color }),
    });
  }

  async updateLabel(labelId: string, data: { name?: string; color?: string }): Promise<{ label: Label }> {
    return this.request<{ label: Label }>(`/labels/${labelId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteLabel(labelId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/labels/${labelId}`, {
      method: 'DELETE',
    });
  }
}

export const api = new ApiService();
export type { User, AuthResponse, Contact, Message, Room, RoomMember, ApiError, AdminStats, AdminUser, Pagination, Note, Label, ChecklistItem, CreateNoteRequest, UpdateNoteRequest, Reaction };
