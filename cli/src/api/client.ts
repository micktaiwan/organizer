import { AuthResponse, Message, Room, User } from '../types.js';

const DEFAULT_SERVER = 'http://51.210.150.25:3001';

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;
  private controllers = new Set<AbortController>();

  constructor(baseUrl: string = DEFAULT_SERVER) {
    this.baseUrl = baseUrl;
  }

  setToken(token: string | null) {
    this.token = token;
  }

  setServer(url: string) {
    this.baseUrl = url;
  }

  abortAll() {
    this.controllers.forEach((c) => c.abort());
    this.controllers.clear();
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const controller = new AbortController();
    this.controllers.add(controller);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText })) as { message?: string };
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      return response.json() as Promise<T>;
    } finally {
      this.controllers.delete(controller);
    }
  }

  // Auth
  async login(username: string, password: string): Promise<AuthResponse> {
    return this.request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  }

  async getMe(): Promise<{ user: User }> {
    return this.request<{ user: User }>('/auth/me');
  }

  // Rooms
  async getRooms(): Promise<{ rooms: Room[] }> {
    return this.request<{ rooms: Room[] }>('/rooms');
  }

  async getRoom(roomId: string): Promise<{ room: Room }> {
    return this.request<{ room: Room }>(`/rooms/${roomId}`);
  }

  async markRoomAsRead(roomId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/rooms/${roomId}/read`, {
      method: 'POST',
    });
  }

  // Messages
  async getMessages(
    roomId: string,
    options: { limit?: number; before?: string } = {}
  ): Promise<{ messages: Message[] }> {
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', options.limit.toString());
    if (options.before) params.set('before', options.before);

    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request<{ messages: Message[] }>(`/rooms/${roomId}/messages${query}`);
  }

  async getMessage(messageId: string): Promise<{ message: Message }> {
    return this.request<{ message: Message }>(`/messages/${messageId}`);
  }

  async sendMessage(
    roomId: string,
    content: string,
    type: 'text' = 'text'
  ): Promise<{ message: Message }> {
    return this.request<{ message: Message }>('/messages', {
      method: 'POST',
      body: JSON.stringify({
        roomId,
        type,
        content,
        clientSource: 'api',
      }),
    });
  }

  // Users
  async getUser(userId: string): Promise<{ user: User }> {
    return this.request<{ user: User }>(`/users/${userId}`);
  }
}

export const apiClient = new ApiClient();
export { DEFAULT_SERVER };
