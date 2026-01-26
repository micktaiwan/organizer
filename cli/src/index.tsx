#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { Command } from 'commander';
import { App } from './App.js';
import { apiClient, DEFAULT_SERVER } from './api/client.js';
import { useStore } from './stores/store.js';

// Suppress abort errors during shutdown
process.on('unhandledRejection', (reason) => {
  // Ignore abort errors (happens when exiting with pending requests)
  if (reason instanceof Error && reason.name === 'AbortError') {
    return;
  }
  // Also ignore fetch errors during shutdown
  if (reason instanceof TypeError && reason.message === 'fetch failed') {
    return;
  }
});

const program = new Command();

program
  .name('organizer-cli')
  .description('CLI chat client for Organizer')
  .version('1.0.0');

program
  .option('-s, --server <url>', 'Server URL', DEFAULT_SERVER)
  .action((options) => {
    // Set server in store
    useStore.getState().setServer(options.server);
    apiClient.setServer(options.server);

    // Render the interactive app
    render(<App />);
  });

program
  .command('rooms')
  .description('List all rooms')
  .option('-s, --server <url>', 'Server URL', DEFAULT_SERVER)
  .action(async (options) => {
    try {
      apiClient.setServer(options.server);

      // Try to load stored token
      const fs = await import('fs');
      const os = await import('os');
      const path = await import('path');
      const configPath = path.join(os.homedir(), '.organizer-cli.json');

      if (!fs.existsSync(configPath)) {
        console.error('Not logged in. Run "organizer-cli" to login interactively.');
        process.exit(1);
      }

      const data = fs.readFileSync(configPath, 'utf-8');
      const { token, server } = JSON.parse(data);
      apiClient.setServer(server || options.server);
      apiClient.setToken(token);

      const { rooms } = await apiClient.getRooms();

      console.log('\nRooms:');
      console.log('─'.repeat(40));
      rooms.forEach((room) => {
        const unread = room.unreadCount ? ` (${room.unreadCount} unread)` : '';
        const type = room.isLobby ? '🏠' : room.type === 'private' ? '🔒' : '📢';
        console.log(`${type} ${room.name}${unread}`);
      });
      console.log('');
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

program
  .command('send')
  .description('Send a message to a room')
  .requiredOption('-r, --room <name>', 'Room name')
  .argument('<message>', 'Message to send')
  .option('-s, --server <url>', 'Server URL', DEFAULT_SERVER)
  .action(async (message, options) => {
    try {
      // Load stored token
      const fs = await import('fs');
      const os = await import('os');
      const path = await import('path');
      const configPath = path.join(os.homedir(), '.organizer-cli.json');

      if (!fs.existsSync(configPath)) {
        console.error('Not logged in. Run "organizer-cli" to login interactively.');
        process.exit(1);
      }

      const data = fs.readFileSync(configPath, 'utf-8');
      const { token, server } = JSON.parse(data);
      apiClient.setServer(server || options.server);
      apiClient.setToken(token);

      // Find room by name
      const { rooms } = await apiClient.getRooms();
      const room = rooms.find(
        (r) => r.name.toLowerCase() === options.room.toLowerCase()
      );

      if (!room) {
        console.error(`Room "${options.room}" not found.`);
        console.log('Available rooms:', rooms.map((r) => r.name).join(', '));
        process.exit(1);
      }

      // Send message
      await apiClient.sendMessage(room._id, message);
      console.log(`Message sent to ${room.name}`);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

program
  .command('login')
  .description('Login and save credentials')
  .requiredOption('-u, --username <username>', 'Username')
  .requiredOption('-p, --password <password>', 'Password')
  .option('-s, --server <url>', 'Server URL', DEFAULT_SERVER)
  .action(async (options) => {
    try {
      apiClient.setServer(options.server);
      const response = await apiClient.login(options.username, options.password);

      // Save credentials
      const fs = await import('fs');
      const os = await import('os');
      const path = await import('path');
      const configPath = path.join(os.homedir(), '.organizer-cli.json');

      fs.writeFileSync(
        configPath,
        JSON.stringify(
          {
            token: response.token,
            user: response.user,
            server: options.server,
          },
          null,
          2
        )
      );

      console.log(`Logged in as ${response.user.displayName || response.user.username}`);
    } catch (error) {
      console.error('Login failed:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

program
  .command('logout')
  .description('Clear saved credentials')
  .action(async () => {
    const fs = await import('fs');
    const os = await import('os');
    const path = await import('path');
    const configPath = path.join(os.homedir(), '.organizer-cli.json');

    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
      console.log('Logged out successfully');
    } else {
      console.log('Not logged in');
    }
  });

program.parse();
