import React from 'react';
import { Box, Text } from 'ink';
import { useStore } from '../stores/store.js';
import { useRooms } from '../hooks/useRooms.js';

export function StatusBar() {
  const { user, server, isConnected } = useStore();
  const { selectedRoom, totalUnread } = useRooms();

  const serverHost = new URL(server).host;
  const connectionStatus = isConnected ? '●' : '○';
  const connectionColor = isConnected ? 'green' : 'red';

  return (
    <Box
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      justifyContent="space-between"
    >
      <Box>
        <Text color={connectionColor}>{connectionStatus}</Text>
        <Text> </Text>
        <Text color="cyan" bold>
          {user?.displayName || user?.username || 'Guest'}
        </Text>
        <Text color="gray">@{serverHost}</Text>
      </Box>
      <Box>
        {selectedRoom && (
          <>
            <Text color="gray">Room: </Text>
            <Text color="yellow" bold>
              {selectedRoom.name}
            </Text>
          </>
        )}
      </Box>
      <Box>
        {totalUnread > 0 && (
          <Text color="red" bold>
            {totalUnread} unread
          </Text>
        )}
      </Box>
    </Box>
  );
}
