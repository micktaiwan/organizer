import React, { useState, useRef, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useRooms } from '../hooks/useRooms.js';
import { useSocket } from '../hooks/useSocket.js';
import { useStore } from '../stores/store.js';

interface Props {
  isFocused: boolean;
}

export function Input({ isFocused }: Props) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { selectedRoomId } = useStore();
  const { sendMessage } = useRooms();
  const { startTyping, stopTyping } = useSocket();
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleChange = (newValue: string) => {
    setValue(newValue);
    setError(null);

    // Handle typing indicator
    if (selectedRoomId && newValue.length > 0) {
      startTyping(selectedRoomId);

      // Clear previous timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      // Stop typing after 2 seconds of inactivity
      typingTimeoutRef.current = setTimeout(() => {
        stopTyping(selectedRoomId);
      }, 2000);
    }
  };

  const handleSubmit = async (text: string) => {
    if (!text.trim() || !selectedRoomId) return;

    // Stop typing
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    stopTyping(selectedRoomId);

    try {
      await sendMessage(text);
      setValue('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    }
  };

  // Cleanup typing timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  if (!selectedRoomId) {
    return (
      <Box
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
      >
        <Text color="gray">Select a room to send messages</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box
        borderStyle="single"
        borderColor={isFocused ? 'cyan' : 'gray'}
        paddingX={1}
      >
        <Text color={isFocused ? 'cyan' : 'gray'}>&gt; </Text>
        <TextInput
          value={value}
          onChange={handleChange}
          onSubmit={handleSubmit}
          placeholder="Type a message..."
          focus={isFocused}
        />
      </Box>
      {error && (
        <Box paddingX={1}>
          <Text color="red">{error}</Text>
        </Box>
      )}
    </Box>
  );
}
