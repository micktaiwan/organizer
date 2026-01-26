import React, { useEffect, useState, useRef } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import { Login } from './components/Login.js';
import { StatusBar } from './components/StatusBar.js';
import { RoomList } from './components/RoomList.js';
import { Chat } from './components/Chat.js';
import { Input } from './components/Input.js';
import { useStore } from './stores/store.js';
import { useAuth } from './hooks/useAuth.js';
import { useSocket } from './hooks/useSocket.js';
import { useRooms } from './hooks/useRooms.js';
import { apiClient } from './api/client.js';

export function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const view = useStore((s) => s.view);
  const focusArea = useStore((s) => s.focusArea);
  const setFocusArea = useStore((s) => s.setFocusArea);
  const cycleFocus = useStore((s) => s.cycleFocus);
  const { isAuthenticated, loadStoredCredentials } = useAuth();
  const { connect, disconnect, joinRoom } = useSocket();
  const { fetchRooms, selectRoom } = useRooms();

  const [isInitializing, setIsInitializing] = useState(true);
  const [roomListIndex, setRoomListIndex] = useState(0);
  const [chatScrollOffset, setChatScrollOffset] = useState(0);
  const initializedRef = useRef(false);

  // Terminal height (reserve more space for status bar, input, help line)
  const terminalRows = stdout?.rows || 24;
  const mainHeight = Math.max(6, terminalRows - 12);

  // Try to restore session on mount
  useEffect(() => {
    const init = async () => {
      await loadStoredCredentials();
      setIsInitializing(false);
    };
    init();
  }, [loadStoredCredentials]);

  // Fetch rooms and connect socket when authenticated (only once)
  useEffect(() => {
    if (isAuthenticated && !isInitializing && !initializedRef.current) {
      initializedRef.current = true;
      fetchRooms().then((fetchedRooms) => {
        // Connect socket, join rooms when connected
        connect(() => {
          fetchedRooms.forEach((room) => {
            joinRoom(room._id);
          });
        });
        // Auto-select first room (Lobby)
        if (fetchedRooms.length > 0) {
          selectRoom(fetchedRooms[0]._id);
        }
      });
    }
  }, [isAuthenticated, isInitializing, fetchRooms, connect, joinRoom, selectRoom]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      apiClient.abortAll();
      disconnect();
    };
  }, [disconnect]);

  // Global key bindings
  useInput((input, key) => {
    // Ctrl+C to exit
    if (input === 'c' && key.ctrl) {
      apiClient.abortAll();
      disconnect();
      exit();
      return;
    }

    // Only handle navigation in chat view
    if (view !== 'chat') return;

    // Tab to cycle focus
    if (key.tab) {
      cycleFocus();
      return;
    }

    // Ctrl+R to refresh rooms (Ctrl+R sends \x12 in terminals)
    if (input === '\x12' || (input === 'r' && key.ctrl)) {
      fetchRooms();
      return;
    }
  });

  // Handle room selection
  const handleSelectRoom = (roomId: string) => {
    selectRoom(roomId);
    setChatScrollOffset(0);
    setFocusArea('input');
  };

  // Loading state
  if (isInitializing) {
    return (
      <Box padding={2}>
        <Text color="cyan">Loading...</Text>
      </Box>
    );
  }

  // Login view
  if (view === 'login') {
    return <Login />;
  }

  // Chat view
  return (
    <Box flexDirection="column">
      <StatusBar />

      <Box height={mainHeight}>
        <RoomList
          selectedIndex={roomListIndex}
          onSelectIndex={setRoomListIndex}
          onSelectRoom={handleSelectRoom}
          isFocused={focusArea === 'rooms'}
          maxHeight={mainHeight}
        />
        <Chat
          isFocused={focusArea === 'chat'}
          scrollOffset={chatScrollOffset}
          onScrollOffsetChange={setChatScrollOffset}
          maxHeight={mainHeight}
        />
      </Box>

      <Input isFocused={focusArea === 'input'} />

      <Box paddingX={1}>
        <Text color="gray">
          Tab: switch | ↑↓: nav | Enter: select/send | Ctrl+R: refresh | Ctrl+C: quit
        </Text>
      </Box>
    </Box>
  );
}
