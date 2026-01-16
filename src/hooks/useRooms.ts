import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Room, Message as ServerMessage, getApiBaseUrl } from '../services/api';
import { Message, Reaction } from '../types';
import { api } from '../services/api';
import { socketService } from '../services/socket';

// Helper to update tray badge
const setTrayBadge = async (hasBadge: boolean) => {
  try {
    await invoke('set_tray_badge', { hasBadge });
  } catch (error) {
    console.error('Failed to set tray badge:', error);
  }
};

interface UseRoomsOptions {
  userId: string | undefined;
  username: string;
}

// Helper to convert server message to client message
const convertServerMessage = (msg: ServerMessage, currentUserId: string | undefined): Message => {
  let actualSenderId: string;
  let senderName: string | undefined;

  if (typeof msg.senderId === 'string') {
    actualSenderId = msg.senderId;
  } else {
    actualSenderId = (msg.senderId as any)._id || (msg.senderId as any).id || '';
    senderName = (msg.senderId as any).displayName;
  }

  const isSender = actualSenderId === currentUserId;

  let text: string | undefined;
  let image: string | undefined;
  let audio: string | undefined;
  let fileUrl: string | undefined;
  let fileName: string | undefined;
  let fileSize: number | undefined;
  let mimeType: string | undefined;

  if (msg.type === 'image') {
    image = msg.content;
  } else if (msg.type === 'audio') {
    audio = msg.content;
  } else if (msg.type === 'file') {
    fileUrl = msg.content;
    fileName = msg.fileName;
    fileSize = msg.fileSize;
    mimeType = msg.mimeType;
  } else {
    text = msg.content;
  }

  const reactions: Reaction[] | undefined = msg.reactions?.map((r: any) => ({
    userId: typeof r.userId === 'string' ? r.userId : r.userId._id || r.userId.id,
    emoji: r.emoji,
    createdAt: new Date(r.createdAt),
  }));

  return {
    id: msg._id,
    serverMessageId: msg._id,
    text,
    image,
    caption: msg.caption,
    audio,
    fileUrl,
    fileName,
    fileSize,
    mimeType,
    sender: isSender ? 'me' : 'them',
    senderName,
    senderId: actualSenderId,
    timestamp: new Date(msg.createdAt),
    status: msg.status as 'sent' | 'delivered' | 'read',
    readBy: msg.readBy,
    reactions,
    type: msg.type,
    clientSource: msg.clientSource,
  };
};

export const useRooms = ({ userId, username }: UseRoomsOptions) => {
  // Rooms state
  const [rooms, setRooms] = useState<Room[]>([]);
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);

  // Messaging state
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  // Typing indicator state
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());

  // Track unread messages in other rooms for tray badge
  const hasUnreadRef = useRef(false);

  // Reload data when API server changes (even if userId stays the same)
  useEffect(() => {
    setCurrentRoomId(null);
    setMessages([]);
    setRooms([]);
    setIsLoadingRooms(true);
  }, [getApiBaseUrl()]);

  // Load rooms on mount and when user changes
  useEffect(() => {
    if (!userId) {
      setIsLoadingRooms(false);
      return;
    }

    const loadRooms = async () => {
      try {
        setIsLoadingRooms(true);
        const { rooms } = await api.getRooms();
        setRooms(rooms);

        // Auto-select lobby if no room selected
        if (!currentRoomId && rooms.length > 0) {
          const lobby = rooms.find(r => r.isLobby);
          if (lobby) {
            setCurrentRoomId(lobby._id);
          }
        }
      } catch (error) {
        console.error('Failed to load rooms:', error);
      } finally {
        setIsLoadingRooms(false);
      }
    };

    loadRooms();
  }, [userId]);

  // Load room details and messages when current room changes
  useEffect(() => {
    if (!currentRoomId) return;

    const loadRoom = async () => {
      try {
        setIsLoadingMessages(true);
        const { room } = await api.getRoom(currentRoomId);
        setCurrentRoom(room);

        // Join Socket.io room
        socketService.joinRoom(currentRoomId);

        // Load message history
        const { messages: serverMessages } = await api.getRoomMessages(currentRoomId);
        const convertedMessages = serverMessages.map((msg: ServerMessage) => convertServerMessage(msg, userId));
        setMessages(convertedMessages);
      } catch (error) {
        console.error('Failed to load room:', error);
      } finally {
        setIsLoadingMessages(false);
      }
    };

    loadRoom();

    return () => {
      if (currentRoomId) {
        socketService.leaveRoom(currentRoomId);
      }
    };
  }, [currentRoomId, userId]);

  // Listen for new messages in current room
  useEffect(() => {
    if (!currentRoomId || !userId) return;

    const unsubNewMessage = socketService.on('message:new', async (data: any) => {
      if (data.roomId === currentRoomId && data.messageId) {
        // Retry logic for transient failures
        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            const { message: serverMsg } = await api.getMessage(data.messageId);
            const converted = convertServerMessage(serverMsg, userId);
            setMessages(current => {
              // Check if message already exists (avoid duplicates from optimistic updates)
              if (current.some(m => m.serverMessageId === data.messageId || m.id === data.messageId)) {
                return current;
              }
              return [...current, converted];
            });
            break; // Success, exit retry loop
          } catch (err) {
            if (attempt === maxRetries) {
              console.error(`Failed to fetch new message after ${maxRetries} attempts:`, err);
            } else {
              // Wait before retrying (exponential backoff: 500ms, 1000ms)
              await new Promise(resolve => setTimeout(resolve, attempt * 500));
            }
          }
        }
      }
    });

    return () => unsubNewMessage();
  }, [currentRoomId, userId]);

  // Listen for typing indicators in current room
  useEffect(() => {
    if (!currentRoomId || !userId) return;

    const unsubTypingStart = socketService.on('typing:start', (data: any) => {
      if (data.roomId === currentRoomId) {
        setTypingUsers(prev => new Set(prev).add(data.from));
      }
    });

    const unsubTypingStop = socketService.on('typing:stop', (data: any) => {
      if (data.roomId === currentRoomId) {
        setTypingUsers(prev => {
          const next = new Set(prev);
          next.delete(data.from);
          return next;
        });
      }
    });

    // Clear typing users when changing rooms
    return () => {
      unsubTypingStart();
      unsubTypingStop();
      setTypingUsers(new Set());
    };
  }, [currentRoomId]);

  // Listen for unread updates to show tray badge
  useEffect(() => {
    if (!userId) return;

    const handleUnreadUpdate = async (data: unknown) => {
      const { unreadCount } = data as { roomId: string; unreadCount: number };
      console.log('unread:updated', data);

      // Only show badge if window is not focused
      const isFocused = await getCurrentWindow().isFocused();
      if (unreadCount > 0 && !isFocused) {
        hasUnreadRef.current = true;
        setTrayBadge(true);
      }
    };

    const unsubUnread = socketService.on('unread:updated', handleUnreadUpdate);

    // Clear badge when window gets focus
    const handleFocus = () => {
      if (hasUnreadRef.current) {
        hasUnreadRef.current = false;
        setTrayBadge(false);
      }
    };

    // Listen for window focus
    const unlisten = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused) {
        handleFocus();
      }
    });

    return () => {
      unsubUnread();
      unlisten.then(fn => fn());
    };
  }, [userId]);

  // Listen for deleted messages in current room
  useEffect(() => {
    if (!currentRoomId) return;

    const unsubDeletedMessage = socketService.on('message:deleted', (data: any) => {
      if (data.roomId === currentRoomId) {
        // Remove the deleted message from local state
        setMessages(prev => prev.filter(m =>
          m.serverMessageId !== data.messageId && m.id !== data.messageId
        ));
      }
    });

    return () => unsubDeletedMessage();
  }, [currentRoomId]);

  // Listen for message reactions in current room
  useEffect(() => {
    if (!currentRoomId) return;

    const unsubReacted = socketService.on('message:reacted', (data: any) => {
      if (data.roomId === currentRoomId) {
        // Reload messages to get updated reactions
        loadMessages();
      }
    });

    return () => unsubReacted();
  }, [currentRoomId]);

  // Listen for message read status updates in current room
  useEffect(() => {
    if (!currentRoomId || !userId) return;

    const unsubMessageRead = socketService.on('message:read', (data: any) => {
      if (data.roomId === currentRoomId) {
        setMessages(prev => prev.map(m => {
          if (data.messageIds.includes(m.serverMessageId || m.id) &&
              !m.readBy?.includes(data.from)) {
            return {
              ...m,
              readBy: [...(m.readBy || []), data.from],
              // Don't force status to 'read' - let UI calculate based on readBy vs memberCount
            };
          }
          return m;
        }));
      }
    });

    return () => unsubMessageRead();
  }, [currentRoomId, userId]);

  // Note: user:status-changed is now handled by UserStatusContext

  // Listen for room events (created, updated)
  useEffect(() => {
    if (!userId) return;

    const refreshRooms = async () => {
      try {
        const { rooms: updatedRooms } = await api.getRooms();
        setRooms(updatedRooms);
      } catch (error) {
        console.error('Failed to refresh rooms:', error);
      }
    };

    const unsubRoomCreated = socketService.on('room:created', async (data: any) => {
      console.log('Room created event received:', data.room?.name);
      await refreshRooms();
    });

    const unsubRoomUpdated = socketService.on('room:updated', async (data: any) => {
      console.log('Room updated event received:', data.room?.name);
      await refreshRooms();
    });

    const unsubRoomDeleted = socketService.on('room:deleted', async (data: any) => {
      console.log('Room deleted event received:', data.roomName);
      // Remove the deleted room from local state
      setRooms(prev => prev.filter(r => r._id !== data.roomId));
      // If we were in the deleted room, clear selection
      if (currentRoomId === data.roomId) {
        setCurrentRoomId(null);
        setMessages([]);
      }
    });

    return () => {
      unsubRoomCreated();
      unsubRoomUpdated();
      unsubRoomDeleted();
    };
  }, [userId, currentRoomId]);

  // Load message history
  const loadMessages = useCallback(async () => {
    if (!currentRoomId) return;
    try {
      const { messages: serverMessages } = await api.getRoomMessages(currentRoomId);
      const convertedMessages = serverMessages.map((msg: ServerMessage) => convertServerMessage(msg, userId));
      setMessages(convertedMessages);
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  }, [currentRoomId, userId]);

  // Send message to current room
  const sendMessage = useCallback(async (text?: string, image?: string, audio?: string, imageBlob?: Blob | null) => {
    if (!currentRoomId || (!text?.trim() && !imageBlob && !audio)) return;

    const messageId = crypto.randomUUID();
    const type = audio ? 'audio' : imageBlob ? 'image' : 'text';
    const caption = imageBlob ? text : undefined;

    // Add optimistic message
    const optimisticMessage: Message = {
      id: messageId,
      text: type === 'text' ? text : undefined,
      image, // Show preview (Data URL)
      audio,
      caption,
      sender: 'me',
      senderName: username,
      timestamp: new Date(),
      status: 'sending',
      clientSource: 'desktop',
    };
    setMessages(prev => [...prev, optimisticMessage]);

    try {
      const response = await api.sendMessage(currentRoomId, type, text, audio, imageBlob, caption);

      setMessages(prev => prev.map(m =>
        m.id === messageId
          ? {
              ...m,
              serverMessageId: response.message._id,
              status: 'sent',
              image: type === 'image' ? response.message.content : image,
              clientSource: response.message.clientSource,
            }
          : m
      ));

      // Notify room of new message
      socketService.notifyMessage(currentRoomId, response.message._id);
    } catch (error) {
      console.error('Failed to send message:', error);
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, status: 'failed' } : m
      ));
    }
  }, [currentRoomId, username]);

  // Send file to current room
  const sendFile = useCallback(async (file: File, caption?: string) => {
    if (!currentRoomId) return;

    const messageId = crypto.randomUUID();

    // Add optimistic message
    const optimisticMessage: Message = {
      id: messageId,
      type: 'file',
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      caption,
      sender: 'me',
      senderName: username,
      timestamp: new Date(),
      status: 'sending',
      clientSource: 'desktop',
    };
    setMessages(prev => [...prev, optimisticMessage]);

    try {
      const response = await api.uploadFile(currentRoomId, file, caption);

      // Update message with server response
      setMessages(prev => prev.map(m =>
        m.id === messageId
          ? {
              ...m,
              serverMessageId: response.message._id,
              fileUrl: response.message.content,
              status: 'sent',
              clientSource: response.message.clientSource,
            }
          : m
      ));

      // Notify room of new message
      socketService.notifyMessage(currentRoomId, response.message._id);
    } catch (error) {
      console.error('Failed to send file:', error);
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, status: 'failed' } : m
      ));
    }
  }, [currentRoomId, username]);

  // Mark messages as read
  const markAsRead = useCallback(async (messageIds: string[]) => {
    if (!currentRoomId || messageIds.length === 0) return;

    try {
      await api.markMessagesAsRead(messageIds);
      socketService.notifyRead(currentRoomId, messageIds);

      // Update local messages
      setMessages(prev => prev.map(m =>
        messageIds.includes(m.serverMessageId || m.id)
          ? { ...m, status: 'read' }
          : m
      ));
    } catch (error) {
      console.error('Failed to mark messages as read:', error);
    }
  }, [currentRoomId]);

  // Delete a message
  const deleteMessage = useCallback(async (messageId: string) => {
    if (!currentRoomId) return;

    try {
      const response = await api.deleteMessage(messageId);

      // Remove message from local state
      setMessages(prev => prev.filter(m =>
        m.serverMessageId !== messageId && m.id !== messageId
      ));

      // Notify other users via socket
      socketService.notifyDelete(response.roomId, messageId);
    } catch (error) {
      console.error('Failed to delete message:', error);
      throw error;
    }
  }, [currentRoomId]);

  // React to a message
  const reactToMessage = useCallback(async (messageId: string, emoji: string) => {
    if (!currentRoomId) return;

    try {
      const response = await api.reactToMessage(messageId, emoji);

      // Update local message with new reactions
      const newReactions: Reaction[] = response.message.reactions?.map((r: any) => ({
        userId: typeof r.userId === 'string' ? r.userId : r.userId._id || r.userId.id,
        emoji: r.emoji,
        createdAt: new Date(r.createdAt),
      })) || [];

      setMessages(prev => prev.map(m =>
        (m.serverMessageId === messageId || m.id === messageId)
          ? { ...m, reactions: newReactions }
          : m
      ));

      // Notify other users via socket
      socketService.notifyReaction(response.roomId, messageId, emoji, response.action);
    } catch (error) {
      console.error('Failed to react to message:', error);
      throw error;
    }
  }, [currentRoomId]);

  // Join room
  const joinRoom = useCallback(async (roomId: string) => {
    try {
      await api.joinRoom(roomId);
      const { rooms: updatedRooms } = await api.getRooms();
      setRooms(updatedRooms);
      setCurrentRoomId(roomId);
    } catch (error) {
      console.error('Failed to join room:', error);
    }
  }, []);

  // Leave room
  const leaveRoom = useCallback(async (roomId: string) => {
    try {
      await api.leaveRoom(roomId);
      const { rooms: updatedRooms } = await api.getRooms();
      setRooms(updatedRooms);

      if (currentRoomId === roomId) {
        setCurrentRoomId(null);
        setMessages([]);
      }
    } catch (error) {
      console.error('Failed to leave room:', error);
    }
  }, [currentRoomId]);

  // Select a room
  const selectRoom = useCallback((roomId: string) => {
    setCurrentRoomId(roomId);
    // Clear badge when user selects a room (they're actively looking at the app)
    if (hasUnreadRef.current) {
      hasUnreadRef.current = false;
      setTrayBadge(false);
    }
  }, []);

  // Create a new public room
  const createRoom = useCallback(async (name: string) => {
    try {
      const { room } = await api.createRoom(name, 'public');
      const { rooms: updatedRooms } = await api.getRooms();
      setRooms(updatedRooms);
      setCurrentRoomId(room._id);
      return room;
    } catch (error) {
      console.error('Failed to create room:', error);
      throw error;
    }
  }, []);

  // Delete a room (creator only)
  const deleteRoom = useCallback(async (roomId: string) => {
    try {
      await api.deleteRoom(roomId);
      // Room will be removed via socket event, but also update locally
      setRooms(prev => prev.filter(r => r._id !== roomId));
      if (currentRoomId === roomId) {
        setCurrentRoomId(null);
        setMessages([]);
      }
    } catch (error) {
      console.error('Failed to delete room:', error);
      throw error;
    }
  }, [currentRoomId]);

  // Notify typing start
  const notifyTypingStart = useCallback(() => {
    if (currentRoomId) {
      socketService.startTyping(currentRoomId);
    }
  }, [currentRoomId]);

  // Notify typing stop
  const notifyTypingStop = useCallback(() => {
    if (currentRoomId) {
      socketService.stopTyping(currentRoomId);
    }
  }, [currentRoomId]);

  return {
    // Rooms
    rooms,
    currentRoomId,
    currentRoom,
    isLoadingRooms,
    isLoadingMessages,

    // Messages
    messages,
    setMessages,
    sendMessage,
    sendFile,
    markAsRead,
    deleteMessage,
    reactToMessage,
    loadMessages,

    // Typing indicators
    typingUsers,
    notifyTypingStart,
    notifyTypingStop,

    // Room management
    selectRoom,
    joinRoom,
    leaveRoom,
    createRoom,
    deleteRoom,
  };
};
