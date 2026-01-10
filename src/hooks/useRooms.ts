import { useState, useEffect, useCallback } from 'react';
import { Room, Message as ServerMessage, getApiBaseUrl } from '../services/api';
import { Message } from '../types';
import { api } from '../services/api';
import { socketService } from '../services/socket';

interface UseRoomsOptions {
  userId: string | undefined;
  username: string;
}

export const useRooms = ({ userId, username }: UseRoomsOptions) => {
  // Rooms state
  const [rooms, setRooms] = useState<Room[]>([]);
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);

  // Messaging state
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

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
        const convertedMessages = serverMessages.map((msg: ServerMessage): Message => {
          let actualSenderId: string;
          let senderName: string | undefined;

          if (typeof msg.senderId === 'string') {
            actualSenderId = msg.senderId;
          } else {
            // senderId is an object with _id (MongoDB) or id
            actualSenderId = (msg.senderId as any)._id || (msg.senderId as any).id || '';
            senderName = (msg.senderId as any).displayName;
          }

          const isSender = actualSenderId === userId;
          console.debug('Message comparison:', { actualSenderId, userId, isSender, msgContent: msg.content?.substring(0, 20) });

          // Map content based on message type
          let text: string | undefined;
          let image: string | undefined;
          let audio: string | undefined;

          if (msg.type === 'image') {
            image = msg.content;
          } else if (msg.type === 'audio') {
            audio = msg.content;
          } else {
            text = msg.content;
          }

          return {
            id: msg._id,
            serverMessageId: msg._id,
            text,
            image,
            audio,
            sender: isSender ? 'me' : 'them',
            senderName,
            senderId: actualSenderId,
            timestamp: new Date(msg.createdAt),
            status: msg.status as 'sent' | 'delivered' | 'read',
            readBy: msg.readBy,
          };
        });
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
    if (!currentRoomId) return;

    const unsubNewMessage = socketService.on('message:new', (data: any) => {
      if (data.roomId === currentRoomId) {
        // New message in current room - reload message history
        loadMessages();
      }
    });

    return () => unsubNewMessage();
  }, [currentRoomId]);

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

  // Load message history
  const loadMessages = useCallback(async () => {
    if (!currentRoomId) return;
    try {
      const { messages: serverMessages } = await api.getRoomMessages(currentRoomId);
      const convertedMessages = serverMessages.map((msg: ServerMessage): Message => {
        let actualSenderId: string;
        let senderName: string | undefined;

        if (typeof msg.senderId === 'string') {
          actualSenderId = msg.senderId;
        } else {
          // senderId is an object with _id (MongoDB) or id
          actualSenderId = (msg.senderId as any)._id || (msg.senderId as any).id || '';
          senderName = (msg.senderId as any).displayName;
        }

        const isSender = actualSenderId === userId;
        console.debug('Message comparison (loadMessages):', { actualSenderId, userId, isSender, msgContent: msg.content?.substring(0, 20) });

        // Map content based on message type
        let text: string | undefined;
        let image: string | undefined;
        let audio: string | undefined;

        if (msg.type === 'image') {
          image = msg.content;
        } else if (msg.type === 'audio') {
          audio = msg.content;
        } else {
          text = msg.content;
        }

        return {
          id: msg._id,
          serverMessageId: msg._id,
          text,
          image,
          audio,
          sender: isSender ? 'me' : 'them',
          senderName,
          senderId: actualSenderId,
          timestamp: new Date(msg.createdAt),
          status: msg.status as 'sent' | 'delivered' | 'read',
          readBy: msg.readBy,
        };
      });
      setMessages(convertedMessages);
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  }, [currentRoomId, userId]);

  // Send message to current room
  const sendMessage = useCallback(async (text?: string, image?: string, audio?: string) => {
    if (!currentRoomId || (!text?.trim() && !image && !audio)) return;

    const messageId = crypto.randomUUID();
    const content = text || image || audio || '';
    const type = audio ? 'audio' : image ? 'image' : 'text';

    // Add optimistic message
    const optimisticMessage: Message = {
      id: messageId,
      text,
      image,
      audio,
      sender: 'me',
      senderName: username,
      timestamp: new Date(),
      status: 'sending',
    };
    setMessages(prev => [...prev, optimisticMessage]);

    try {
      const response = await api.sendMessage(currentRoomId, type, content);

      // Update message with server ID
      setMessages(prev => prev.map(m =>
        m.id === messageId
          ? { ...m, serverMessageId: response.message._id, status: 'sent' }
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
  }, []);

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
    markAsRead,
    deleteMessage,
    loadMessages,

    // Room management
    selectRoom,
    joinRoom,
    leaveRoom,
  };
};
