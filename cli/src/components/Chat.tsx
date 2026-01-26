import React, { useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { Message } from './Message.js';
import { useStore } from '../stores/store.js';
import { useRooms } from '../hooks/useRooms.js';
import { getUserId } from '../types.js';

interface Props {
  isFocused: boolean;
  scrollOffset: number;
  onScrollOffsetChange: (offset: number) => void;
  maxHeight: number;
}

export function Chat({ isFocused, scrollOffset, onScrollOffsetChange, maxHeight }: Props) {
  const user = useStore((s) => s.user);
  const selectedRoomId = useStore((s) => s.selectedRoomId);
  const typingUsers = useStore((s) => s.typingUsers);
  const onlineUsers = useStore((s) => s.onlineUsers);
  const { selectedRoom, currentMessages, loadMoreMessages } = useRooms();

  // Calculate visible height (account for border and header)
  const visibleHeight = Math.max(3, maxHeight - 4);

  // Ref to avoid infinite loop with loadMoreMessages
  const loadMoreRef = useRef(loadMoreMessages);
  loadMoreRef.current = loadMoreMessages;

  useInput(
    (input, key) => {
      if (!isFocused) return;

      if (key.upArrow) {
        const maxOffset = Math.max(0, currentMessages.length - visibleHeight);
        onScrollOffsetChange(Math.min(scrollOffset + 1, maxOffset));
      } else if (key.downArrow) {
        onScrollOffsetChange(Math.max(0, scrollOffset - 1));
      } else if (key.pageUp) {
        const maxOffset = Math.max(0, currentMessages.length - visibleHeight);
        onScrollOffsetChange(Math.min(scrollOffset + visibleHeight, maxOffset));
      } else if (key.pageDown) {
        onScrollOffsetChange(Math.max(0, scrollOffset - visibleHeight));
      }
    },
    { isActive: isFocused }
  );

  // Load more messages when scrolling to top
  useEffect(() => {
    if (scrollOffset >= currentMessages.length - visibleHeight - 5 && selectedRoomId) {
      loadMoreRef.current(selectedRoomId);
    }
  }, [scrollOffset, currentMessages.length, selectedRoomId, visibleHeight]);

  // Get typing users for current room
  const roomTypingUsers = selectedRoomId ? typingUsers[selectedRoomId] : null;
  const typingUsernames = roomTypingUsers
    ? Array.from(roomTypingUsers)
        .map((userId) => {
          const u = onlineUsers.get(userId);
          return u?.displayName || u?.username || 'Someone';
        })
        .filter(Boolean)
    : [];

  if (!selectedRoom) {
    return (
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor={isFocused ? 'cyan' : 'gray'}
        flexGrow={1}
        height={maxHeight}
        paddingX={1}
        justifyContent="center"
        alignItems="center"
      >
        <Text color="gray">Select a room</Text>
      </Box>
    );
  }

  // Calculate visible messages based on scroll offset
  const startIndex = Math.max(0, currentMessages.length - visibleHeight - scrollOffset);
  const endIndex = currentMessages.length - scrollOffset;
  const visibleMessages = currentMessages.slice(startIndex, endIndex);

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={isFocused ? 'cyan' : 'gray'}
      flexGrow={1}
      height={maxHeight}
      paddingX={1}
    >
      <Box justifyContent="space-between">
        <Text bold color={isFocused ? 'cyan' : 'white'}>
          {selectedRoom.name} {scrollOffset > 0 ? `↑${scrollOffset}` : ''}
        </Text>
        <Text color="gray">
          {selectedRoom.members.filter((m) => m.isOnline).length}/{selectedRoom.members.length}
        </Text>
      </Box>

      <Box flexDirection="column" flexGrow={1} overflowY="hidden">
        {visibleMessages.length === 0 ? (
          <Text color="gray" italic>
            No messages yet
          </Text>
        ) : (
          visibleMessages.map((msg) => (
            <Message key={msg._id} message={msg} currentUserId={getUserId(user)} />
          ))
        )}
      </Box>

      {typingUsernames.length > 0 && (
        <Text color="gray" italic>
          {typingUsernames.join(', ')} typing...
        </Text>
      )}
    </Box>
  );
}
