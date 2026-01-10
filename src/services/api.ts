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
  username: string;
  displayName: string;
  email: string;
  isOnline?: boolean;
  isAdmin?: boolean;
  lastSeen?: string;
  peerId?: string | null;
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

interface Message {
  _id: string;
  roomId: string;
  senderId: string | User;
  type: 'text' | 'image' | 'audio' | 'system';
  content: string;
  status: 'sent' | 'delivered' | 'read';
  readBy: string[];
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

    const response = await fetch(`${apiBaseUrl}${endpoint}`, {
      ...options,
      headers,
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

  async updateStatus(status?: string, statusMessage?: string | null, isMuted?: boolean): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>('/users/status', {
      method: 'PUT',
      body: JSON.stringify({ status, statusMessage, isMuted }),
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

  async getRoomMessages(roomId: string, limit = 50, before?: string): Promise<{ messages: Message[] }> {
    let url = `/rooms/${roomId}/messages?limit=${limit}`;
    if (before) url += `&before=${encodeURIComponent(before)}`;
    return this.request<{ messages: Message[] }>(url);
  }

  // Messages
  async sendMessage(roomId: string, type: string, content: string): Promise<{ message: Message }> {
    return this.request<{ message: Message }>('/messages', {
      method: 'POST',
      body: JSON.stringify({ roomId, type, content }),
    });
  }

  async markMessageAsRead(id: string): Promise<{ message: Message }> {
    return this.request<{ message: Message }>(`/messages/${id}/read`, {
      method: 'PATCH',
    });
  }

  async markMessagesAsRead(messageIds: string[]): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>('/messages/read-bulk', {
      method: 'POST',
      body: JSON.stringify({ messageIds }),
    });
  }

  async deleteMessage(id: string): Promise<{ success: boolean; roomId: string; messageId: string }> {
    return this.request<{ success: boolean; roomId: string; messageId: string }>(`/messages/${id}`, {
      method: 'DELETE',
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
}

export const api = new ApiService();
export type { User, AuthResponse, Contact, Message, Room, RoomMember, ApiError, AdminStats, AdminUser, Pagination };
