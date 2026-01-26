import { useCallback } from 'react';
import { apiClient } from '../api/client.js';
import { useStore } from '../stores/store.js';

export function useRooms() {
  const {
    rooms,
    selectedRoomId,
    roomMessages,
    setRooms,
    setSelectedRoom,
    setMessages,
    prependMessages,
  } = useStore();

  const fetchRooms = useCallback(async () => {
    try {
      const { rooms: fetchedRooms } = await apiClient.getRooms();
      // Sort: Lobby first, then by lastMessageAt
      const sorted = fetchedRooms.sort((a, b) => {
        if (a.isLobby) return -1;
        if (b.isLobby) return 1;
        const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return bTime - aTime;
      });
      setRooms(sorted);
      return sorted;
    } catch (error) {
      throw error;
    }
  }, [setRooms]);

  const selectRoom = useCallback(async (roomId: string) => {
    setSelectedRoom(roomId);

    // Always fetch fresh messages
    try {
      const { messages } = await apiClient.getMessages(roomId, { limit: 50 });
      setMessages(roomId, messages); // Already ASC from server
    } catch (error) {
      // Failed to fetch messages
    }

    // Mark as read
    try {
      await apiClient.markRoomAsRead(roomId);
    } catch {
      // Ignore read marking errors
    }
  }, [setSelectedRoom, setMessages]);

  const loadMoreMessages = useCallback(async (roomId: string) => {
    const existing = roomMessages[roomId] || [];
    if (existing.length === 0) return;

    const oldest = existing[0];
    try {
      const { messages } = await apiClient.getMessages(roomId, {
        limit: 50,
        before: oldest.createdAt,
      });
      prependMessages(roomId, messages); // Already ASC from server
    } catch {
      // Failed to load more messages
    }
  }, [roomMessages, prependMessages]);

  const sendMessage = useCallback(async (content: string) => {
    if (!selectedRoomId || !content.trim()) return;

    try {
      await apiClient.sendMessage(selectedRoomId, content.trim());
    } catch (error) {
      throw error;
    }
  }, [selectedRoomId]);

  const selectedRoom = rooms.find((r) => r._id === selectedRoomId);
  const currentMessages = selectedRoomId ? roomMessages[selectedRoomId] || [] : [];
  const totalUnread = rooms.reduce((sum, r) => sum + (r.unreadCount || 0), 0);

  return {
    rooms,
    selectedRoom,
    selectedRoomId,
    currentMessages,
    totalUnread,
    fetchRooms,
    selectRoom,
    loadMoreMessages,
    sendMessage,
  };
}
