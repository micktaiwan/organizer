import React from 'react';
import { Box, Text, useInput } from 'ink';
import { useStore } from '../stores/store.js';
import { useRooms } from '../hooks/useRooms.js';

interface Props {
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
  onSelectRoom: (roomId: string) => void;
  isFocused: boolean;
  maxHeight: number;
}

export function RoomList({ selectedIndex, onSelectIndex, onSelectRoom, isFocused, maxHeight }: Props) {
  const { rooms } = useRooms();
  const selectedRoomId = useStore((s) => s.selectedRoomId);

  // Calculate visible rooms (account for border and header)
  const visibleCount = Math.max(1, maxHeight - 4);
  const scrollOffset = Math.max(0, selectedIndex - visibleCount + 1);
  const visibleRooms = rooms.slice(scrollOffset, scrollOffset + visibleCount);

  useInput(
    (input, key) => {
      if (!isFocused) return;

      if (key.upArrow) {
        onSelectIndex(Math.max(0, selectedIndex - 1));
      } else if (key.downArrow) {
        onSelectIndex(Math.min(rooms.length - 1, selectedIndex + 1));
      } else if (key.return && rooms[selectedIndex]) {
        onSelectRoom(rooms[selectedIndex]._id);
      }
    },
    { isActive: isFocused }
  );

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={isFocused ? 'cyan' : 'gray'}
      width={20}
      height={maxHeight}
      paddingX={1}
    >
      <Box>
        <Text bold color={isFocused ? 'cyan' : 'white'}>
          Rooms {scrollOffset > 0 ? '↑' : ' '}
        </Text>
      </Box>
      {visibleRooms.map((room, idx) => {
        const actualIndex = scrollOffset + idx;
        const isSelected = actualIndex === selectedIndex;
        const isActive = room._id === selectedRoomId;
        const hasUnread = (room.unreadCount || 0) > 0;

        return (
          <Box key={room._id}>
            <Text color={isSelected ? 'cyan' : isActive ? 'yellow' : 'white'}>
              {isSelected ? '>' : ' '}
            </Text>
            <Text
              color={isActive ? 'yellow' : hasUnread ? 'white' : 'gray'}
              bold={hasUnread || isActive}
            >
              {room.name.slice(0, 14)}
            </Text>
            {hasUnread && (
              <Text color="red" bold>
                ({room.unreadCount})
              </Text>
            )}
          </Box>
        );
      })}
      {scrollOffset + visibleCount < rooms.length && (
        <Text color="gray">↓ more</Text>
      )}
    </Box>
  );
}
