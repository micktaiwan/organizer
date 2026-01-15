import { Server } from 'socket.io';
import { IMcpToken } from '../../models/McpToken.js';
import { IUser } from '../../models/User.js';
import { McpToolDefinition, McpToolResult } from '../types.js';

import { listRoomsHandler, listRoomsDefinition } from './list-rooms.js';
import { listMessagesHandler, listMessagesDefinition } from './list-messages.js';
import { searchUsersHandler, searchUsersDefinition } from './search-users.js';
import { getUnreadHandler, getUnreadDefinition } from './get-unread.js';
import { sendMessageHandler, sendMessageDefinition } from './send-message.js';

type ToolHandler = (
  args: Record<string, unknown>,
  token: IMcpToken,
  user: IUser,
  io?: Server
) => Promise<McpToolResult>;

const handlers: Record<string, ToolHandler> = {
  list_rooms: listRoomsHandler,
  list_messages: listMessagesHandler,
  search_users: searchUsersHandler,
  get_unread: getUnreadHandler,
  send_message: sendMessageHandler,
};

const definitions: Record<string, McpToolDefinition> = {
  list_rooms: listRoomsDefinition,
  list_messages: listMessagesDefinition,
  search_users: searchUsersDefinition,
  get_unread: getUnreadDefinition,
  send_message: sendMessageDefinition,
};

const WRITE_TOOLS = ['send_message'];

export function getToolDefinitions(token: IMcpToken): McpToolDefinition[] {
  const allowedTools = token.allowedTools.includes('*')
    ? Object.keys(definitions)
    : token.allowedTools.filter(t => t in definitions);

  return allowedTools.map(name => definitions[name]);
}

export function isToolAllowed(token: IMcpToken, toolName: string): boolean {
  if (token.allowedTools.includes('*')) return true;
  return token.allowedTools.includes(toolName);
}

export async function handleToolCall(
  toolName: string,
  args: Record<string, unknown>,
  token: IMcpToken,
  user: IUser,
  io?: Server
): Promise<McpToolResult> {
  const handler = handlers[toolName];

  if (!handler) {
    return {
      content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
      isError: true,
    };
  }

  if (WRITE_TOOLS.includes(toolName) && !token.scopes.includes('write')) {
    return {
      content: [{ type: 'text', text: 'This token does not have write permissions' }],
      isError: true,
    };
  }

  return handler(args, token, user, io);
}
