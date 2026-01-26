import { create } from 'zustand';
import { Message, Room, User, UserStatus } from '../types.js';

export type AppView = 'login' | 'chat';
export type FocusArea = 'rooms' | 'chat' | 'input';

interface OnlineUser {
  id: string;
  username: string;
  displayName: string;
  status: UserStatus;
  statusMessage: string | null;
  isMuted: boolean;
  isOnline: boolean;
  isBot: boolean;
}

interface AppState {
  // Auth
  user: User | null;
  token: string | null;
  server: string;

  // View state
  view: AppView;
  focusArea: FocusArea;

  // Rooms
  rooms: Room[];
  selectedRoomId: string | null;
  roomMessages: Record<string, Message[]>;

  // Online users
  onlineUsers: Map<string, OnlineUser>;

  // Typing indicators
  typingUsers: Record<string, Set<string>>; // roomId -> Set<userId>

  // Connection state
  isConnected: boolean;
  isConnecting: boolean;

  // Actions
  setAuth: (user: User, token: string) => void;
  logout: () => void;
  setServer: (server: string) => void;
  setView: (view: AppView) => void;
  setFocusArea: (area: FocusArea) => void;
  cycleFocus: () => void;

  setRooms: (rooms: Room[]) => void;
  updateRoom: (room: Room) => void;
  setSelectedRoom: (roomId: string | null) => void;
  updateUnreadCount: (roomId: string, count: number) => void;

  setMessages: (roomId: string, messages: Message[]) => void;
  addMessage: (roomId: string, message: Message) => void;
  prependMessages: (roomId: string, messages: Message[]) => void;

  setOnlineUsers: (users: OnlineUser[]) => void;
  setUserOnline: (user: OnlineUser) => void;
  setUserOffline: (userId: string) => void;

  addTypingUser: (roomId: string, userId: string) => void;
  removeTypingUser: (roomId: string, userId: string) => void;

  setConnected: (connected: boolean) => void;
  setConnecting: (connecting: boolean) => void;
}

export const useStore = create<AppState>((set, get) => ({
  // Auth
  user: null,
  token: null,
  server: 'http://51.210.150.25:3001',

  // View state
  view: 'login',
  focusArea: 'rooms',

  // Rooms
  rooms: [],
  selectedRoomId: null,
  roomMessages: {},

  // Online users
  onlineUsers: new Map(),

  // Typing indicators
  typingUsers: {},

  // Connection state
  isConnected: false,
  isConnecting: false,

  // Actions
  setAuth: (user, token) => set({ user, token, view: 'chat' }),
  logout: () => set({ user: null, token: null, view: 'login', rooms: [], selectedRoomId: null, roomMessages: {} }),
  setServer: (server) => set({ server }),
  setView: (view) => set({ view }),
  setFocusArea: (area) => set({ focusArea: area }),
  cycleFocus: () => {
    const current = get().focusArea;
    const order: FocusArea[] = ['rooms', 'chat', 'input'];
    const idx = order.indexOf(current);
    set({ focusArea: order[(idx + 1) % order.length] });
  },

  setRooms: (rooms) => set({ rooms }),
  updateRoom: (room) => set((state) => ({
    rooms: state.rooms.map((r) => (r._id === room._id ? room : r)),
  })),
  setSelectedRoom: (roomId) => set({ selectedRoomId: roomId }),
  updateUnreadCount: (roomId, count) => set((state) => ({
    rooms: state.rooms.map((r) =>
      r._id === roomId ? { ...r, unreadCount: count } : r
    ),
  })),

  setMessages: (roomId, messages) => set((state) => ({
    roomMessages: { ...state.roomMessages, [roomId]: messages },
  })),
  addMessage: (roomId, message) => set((state) => {
    const existing = state.roomMessages[roomId] || [];
    // Avoid duplicates
    if (existing.some((m) => m._id === message._id)) {
      return state;
    }
    return {
      roomMessages: { ...state.roomMessages, [roomId]: [...existing, message] },
    };
  }),
  prependMessages: (roomId, messages) => set((state) => {
    const existing = state.roomMessages[roomId] || [];
    const existingIds = new Set(existing.map((m) => m._id));
    const newMessages = messages.filter((m) => !existingIds.has(m._id));
    return {
      roomMessages: { ...state.roomMessages, [roomId]: [...newMessages, ...existing] },
    };
  }),

  setOnlineUsers: (users) => {
    const map = new Map<string, OnlineUser>();
    users.forEach((u) => map.set(u.id, u));
    set({ onlineUsers: map });
  },
  setUserOnline: (user) => set((state) => {
    const newMap = new Map(state.onlineUsers);
    newMap.set(user.id, user);
    return { onlineUsers: newMap };
  }),
  setUserOffline: (userId) => set((state) => {
    const newMap = new Map(state.onlineUsers);
    const user = newMap.get(userId);
    if (user) {
      newMap.set(userId, { ...user, isOnline: false });
    }
    return { onlineUsers: newMap };
  }),

  addTypingUser: (roomId, userId) => set((state) => {
    const current = state.typingUsers[roomId] || new Set();
    const newSet = new Set(current);
    newSet.add(userId);
    return { typingUsers: { ...state.typingUsers, [roomId]: newSet } };
  }),
  removeTypingUser: (roomId, userId) => set((state) => {
    const current = state.typingUsers[roomId];
    if (!current) return state;
    const newSet = new Set(current);
    newSet.delete(userId);
    return { typingUsers: { ...state.typingUsers, [roomId]: newSet } };
  }),

  setConnected: (connected) => set({ isConnected: connected }),
  setConnecting: (connecting) => set({ isConnecting: connecting }),
}));
