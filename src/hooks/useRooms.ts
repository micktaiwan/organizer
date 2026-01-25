import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Room, Message as ServerMessage, getApiBaseUrl } from '../services/api';
import { Message, Reaction } from '../types';
import { api } from '../services/api';
import { socketService } from '../services/socket';
import { showMessageNotification } from '../utils/notifications';

// Check if running in Tauri environment
const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// Helper to update tray badge
const setTrayBadge = async (hasBadge: boolean) => {
  if (!isTauri()) return;
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
  let videoUrl: string | undefined;
  let thumbnailUrl: string | null | undefined;
  let duration: number | undefined;
  let width: number | undefined;
  let height: number | undefined;

  if (msg.type === 'image') {
    image = msg.content;
  } else if (msg.type === 'audio') {
    audio = msg.content;
  } else if (msg.type === 'file') {
    fileUrl = msg.content;
    fileName = msg.fileName;
    fileSize = msg.fileSize;
    mimeType = msg.mimeType;
  } else if (msg.type === 'video') {
    videoUrl = msg.content;
    thumbnailUrl = (msg as any).thumbnailUrl;
    duration = (msg as any).duration;
    width = (msg as any).width;
    height = (msg as any).height;
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
    videoUrl,
    thumbnailUrl,
    duration,
    width,
    height,
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

  // Search/navigation state
  const [messageMode, setMessageMode] = useState<'latest' | 'around'>('latest');
  const [targetMessageId, setTargetMessageId] = useState<string | null>(null);
  const [hasNewerMessages, setHasNewerMessages] = useState(false);

  // Unread messages state
  const [firstUnreadId, setFirstUnreadId] = useState<string | null>(null);
  const [hasOlderUnread, setHasOlderUnread] = useState(false);
  const [skippedUnreadCount, setSkippedUnreadCount] = useState(0);

  // Pagination state
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Typing indicator state
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());

  // Track unread messages in other rooms for tray badge
  const hasUnreadRef = useRef(false);

  // Track message IDs already marked as read to prevent duplicate requests
  const markedAsReadRef = useRef<Set<string>>(new Set());

  // Track which room the current messages belong to (prevents race conditions on room switch)
  const messagesRoomIdRef = useRef<string | null>(null);

  // Track pending message sends to prevent duplicates from socket events
  const pendingSendsRef = useRef<Set<string>>(new Set());

  // Reload data when API server changes (even if userId stays the same)
  useEffect(() => {
    setCurrentRoomId(null);
    setMessages([]);
    setRooms([]);
    setIsLoadingRooms(true);
    setMessageMode('latest');
    setTargetMessageId(null);
    setHasNewerMessages(false);
    setFirstUnreadId(null);
    setHasOlderUnread(false);
    setSkippedUnreadCount(0);
    setHasMoreMessages(true);
    setIsLoadingMore(false);
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
        setMessageMode('latest');
        setTargetMessageId(null);
        setHasNewerMessages(false);
        setFirstUnreadId(null);
        setHasOlderUnread(false);
        setSkippedUnreadCount(0);
        setHasMoreMessages(true);
        setIsLoadingMore(false);
        const { room } = await api.getRoom(currentRoomId);
        setCurrentRoom(room);

        // Join Socket.io room
        socketService.joinRoom(currentRoomId);

        // Load message history with unread info
        const response = await api.getUnreadMessages(currentRoomId);
        const convertedMessages = response.messages.map((msg: ServerMessage) => convertServerMessage(msg, userId));
        setMessages(convertedMessages);
        messagesRoomIdRef.current = currentRoomId;

        // Set unread state
        setFirstUnreadId(response.firstUnreadId);
        setHasOlderUnread(response.hasOlderUnread);
        setSkippedUnreadCount(response.skippedUnread);

        // Mark room as read (updates lastReadAt for future visits)
        await api.markRoomAsRead(currentRoomId);
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
      // Note: We don't filter by userId here because the same user may send
      // messages from different devices (Android, desktop). The duplicate check
      // below (line checking serverMessageId) handles optimistic update deduplication.

      // Skip socket events for our own pending messages to avoid race condition
      // between optimistic update and socket event (BUG-001 fix)
      if (data.from === userId && pendingSendsRef.current.size > 0) {
        return;
      }

      if (data.roomId === currentRoomId && data.messageId) {
        // Clear unread separator when new message arrives
        setFirstUnreadId(null);
        setHasOlderUnread(false);
        setSkippedUnreadCount(0);

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
      const { roomId, unreadCount } = data as { roomId: string; unreadCount: number };
      console.log('unread:updated', data);

      // Update unreadCount in rooms state
      setRooms(prev => prev.map(room =>
        room._id === roomId ? { ...room, unreadCount } : room
      ));

      // Only show badge if window is not focused (Tauri only)
      if (isTauri()) {
        const isFocused = await getCurrentWindow().isFocused();
        if (unreadCount > 0 && !isFocused) {
          hasUnreadRef.current = true;
          setTrayBadge(true);
        }
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

    // Listen for window focus (Tauri only)
    let unlisten: Promise<() => void> | null = null;
    if (isTauri()) {
      unlisten = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
        if (focused) {
          handleFocus();
        }
      });
    }

    return () => {
      unsubUnread();
      unlisten?.then(fn => fn());
    };
  }, [userId]);

  // Show desktop notifications for new messages when window is not focused
  useEffect(() => {
    if (!userId) return;

    const unsubNotification = socketService.on('message:new', async (data: any) => {
      // Don't notify for own messages
      if (data.from === userId) return;

      // Only notify when window is not focused (Tauri only)
      if (isTauri()) {
        const isFocused = await getCurrentWindow().isFocused();
        if (!isFocused && data.fromName && data.preview) {
          showMessageNotification(data.fromName, data.roomName || 'Chat', data.preview, data.roomId);
        }
      }
    });

    return () => unsubNotification();
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

  // Listen for message read status updates (from OTHER users only)
  useEffect(() => {
    if (!userId) return;

    const unsubMessageRead = socketService.on('message:read', (data: any) => {
      // Skip self-broadcasts (local state already updated in markAsRead)
      if (data.from === userId) return;

      setMessages(prev => {
        const hasMatch = prev.some(m =>
          data.messageIds.includes(m.serverMessageId || m.id)
        );
        if (!hasMatch) return prev;

        return prev.map(m => {
          if (data.messageIds.includes(m.serverMessageId || m.id) &&
              !m.readBy?.includes(data.from)) {
            return {
              ...m,
              readBy: [...(m.readBy || []), data.from],
            };
          }
          return m;
        });
      });
    });

    return () => unsubMessageRead();
  }, [userId]);

  // Listen for video thumbnail ready events
  useEffect(() => {
    const unsubThumbnail = socketService.on('video:thumbnail-ready', (data: any) => {
      const { messageId, thumbnailUrl, duration, width, height } = data;
      console.log('[Thumbnail] Event received:', { messageId, thumbnailUrl });

      setMessages(prev => {
        console.log('[Thumbnail] Current messages:', prev.map(m => ({ id: m.id, serverMessageId: m.serverMessageId, type: m.type })));
        return prev.map(m => {
          // Match by serverMessageId or id
          if (m.serverMessageId === messageId || m.id === messageId) {
            console.log('[Thumbnail] Match found, updating message:', m.id);
            return {
              ...m,
              thumbnailUrl,
              duration: duration ?? m.duration,
              width: width ?? m.width,
              height: height ?? m.height,
            };
          }
          return m;
        });
      });
    });

    return () => unsubThumbnail();
  }, []);

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
      messagesRoomIdRef.current = currentRoomId;
      setMessageMode('latest');
      setTargetMessageId(null);
      setHasNewerMessages(false);
      setFirstUnreadId(null);
      setHasOlderUnread(false);
      setSkippedUnreadCount(0);
      setHasMoreMessages(true);
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  }, [currentRoomId, userId]);

  // Load older messages (pagination)
  const loadOlderMessages = useCallback(async () => {
    if (!currentRoomId || isLoadingMore || !hasMoreMessages) return;

    const oldestMessage = messages[0];
    if (!oldestMessage) return;

    const beforeTimestamp = oldestMessage.timestamp.toISOString();

    try {
      setIsLoadingMore(true);
      const { messages: serverMessages } = await api.getRoomMessages(currentRoomId, 20, beforeTimestamp);
      const convertedMessages = serverMessages.map((msg: ServerMessage) => convertServerMessage(msg, userId));

      if (convertedMessages.length === 0) {
        setHasMoreMessages(false);
      } else {
        setMessages(prev => [...convertedMessages, ...prev]);
        setHasMoreMessages(convertedMessages.length === 20);
      }
    } catch (error) {
      console.error('Failed to load older messages:', error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [currentRoomId, userId, messages, isLoadingMore, hasMoreMessages]);

  // Load messages around a specific timestamp (for search results)
  const loadMessagesAround = useCallback(async (timestamp: string, msgId?: string) => {
    if (!currentRoomId) return;
    try {
      setIsLoadingMessages(true);
      const response = await api.getMessagesAround(currentRoomId, timestamp);
      const convertedMessages = response.messages.map((msg: ServerMessage) =>
        convertServerMessage(msg, userId)
      );
      setMessages(convertedMessages);
      setMessageMode('around');
      setHasNewerMessages(response.hasNewer);
      setTargetMessageId(msgId || response.targetMessageId);
    } catch (error) {
      console.error('Failed to load messages around timestamp:', error);
    } finally {
      setIsLoadingMessages(false);
    }
  }, [currentRoomId, userId]);

  // Return to latest messages (from search mode)
  const returnToLatest = useCallback(async () => {
    if (!currentRoomId) return;
    try {
      setIsLoadingMessages(true);
      const { messages: serverMessages } = await api.getRoomMessages(currentRoomId);
      const convertedMessages = serverMessages.map((msg: ServerMessage) =>
        convertServerMessage(msg, userId)
      );
      setMessages(convertedMessages);
      setMessageMode('latest');
      setTargetMessageId(null);
      setHasNewerMessages(false);
    } catch (error) {
      console.error('Failed to return to latest messages:', error);
    } finally {
      setIsLoadingMessages(false);
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

    // Track pending send to prevent duplicate from socket event (BUG-001 fix)
    pendingSendsRef.current.add(messageId);

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
    } catch (error) {
      console.error('Failed to send message:', error);
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, status: 'failed' } : m
      ));
    } finally {
      // Clear pending tracking after response (success or failure)
      pendingSendsRef.current.delete(messageId);
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

    // Track pending send to prevent duplicate from socket event (BUG-001 fix)
    pendingSendsRef.current.add(messageId);

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
    } catch (error) {
      console.error('Failed to send file:', error);
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, status: 'failed' } : m
      ));
    } finally {
      // Clear pending tracking after response (success or failure)
      pendingSendsRef.current.delete(messageId);
    }
  }, [currentRoomId, username]);

  // Send video to current room
  const sendVideo = useCallback(async (
    videoBlob: Blob,
    caption?: string,
    onProgress?: (progress: number) => void
  ) => {
    if (!currentRoomId) return;

    const messageId = crypto.randomUUID();

    // Add optimistic message
    const optimisticMessage: Message = {
      id: messageId,
      type: 'video',
      fileSize: videoBlob.size,
      mimeType: videoBlob.type,
      caption,
      thumbnailUrl: null, // Will be updated when server generates it
      sender: 'me',
      senderName: username,
      timestamp: new Date(),
      status: 'sending',
      clientSource: 'desktop',
    };
    setMessages(prev => [...prev, optimisticMessage]);

    // Track pending send to prevent duplicate from socket event
    pendingSendsRef.current.add(messageId);

    try {
      const response = await api.uploadVideoWithProgress(
        currentRoomId,
        videoBlob,
        caption,
        onProgress || (() => {})
      );

      // Update message with server response
      setMessages(prev => prev.map(m =>
        m.id === messageId
          ? {
              ...m,
              serverMessageId: response.message._id,
              videoUrl: response.message.content,
              thumbnailUrl: (response.message as any).thumbnailUrl || null,
              duration: (response.message as any).duration,
              width: (response.message as any).width,
              height: (response.message as any).height,
              status: 'sent',
              clientSource: response.message.clientSource,
            }
          : m
      ));
    } catch (error) {
      console.error('Failed to send video:', error);
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, status: 'failed' } : m
      ));
    } finally {
      pendingSendsRef.current.delete(messageId);
    }
  }, [currentRoomId, username]);

  // Mark messages as read
  const markAsRead = useCallback(async (messageIds: string[]) => {
    if (!currentRoomId || messageIds.length === 0) return;

    // Track IDs immediately to prevent duplicate requests
    messageIds.forEach(id => markedAsReadRef.current.add(id));

    try {
      // Server will broadcast socket event to other clients
      await api.markMessagesAsRead(messageIds, currentRoomId);

      // Update local messages with current user in readBy
      setMessages(prev => prev.map(m =>
        messageIds.includes(m.serverMessageId || m.id)
          ? { ...m, readBy: [...(m.readBy || []), userId || ''] }
          : m
      ));
    } catch (error) {
      console.error('Failed to mark messages as read:', error);
      // Remove from tracking so they can be retried
      messageIds.forEach(id => markedAsReadRef.current.delete(id));
    }
  }, [currentRoomId, userId]);

  // Auto-mark messages as read when viewing a room
  useEffect(() => {
    if (!currentRoomId || !userId || messages.length === 0) return;

    // Guard: only mark if messages belong to the current room (prevents race condition on switch)
    if (messagesRoomIdRef.current !== currentRoomId) return;

    // Find unread messages from other users (excluding already-requested IDs)
    const unreadMessageIds = messages
      .filter(m =>
        m.sender === 'them' &&
        m.serverMessageId &&
        !m.readBy?.includes(userId) &&
        !markedAsReadRef.current.has(m.serverMessageId)
      )
      .map(m => m.serverMessageId as string);

    if (unreadMessageIds.length > 0) {
      markAsRead(unreadMessageIds);
    }
  }, [currentRoomId, userId, messages, markAsRead]);

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
    // Clear messages and tracking when switching rooms to prevent race conditions
    messagesRoomIdRef.current = null;
    setMessages([]);
    markedAsReadRef.current.clear();
    // Reset unread count for this room
    setRooms(prev => prev.map(room =>
      room._id === roomId ? { ...room, unreadCount: 0 } : room
    ));
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
    sendVideo,
    markAsRead,
    deleteMessage,
    reactToMessage,
    loadMessages,
    loadMessagesAround,
    returnToLatest,

    // Search/navigation state
    messageMode,
    targetMessageId,
    hasNewerMessages,

    // Unread messages state
    firstUnreadId,
    hasOlderUnread,
    skippedUnreadCount,

    // Pagination
    hasMoreMessages,
    isLoadingMore,
    loadOlderMessages,

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
