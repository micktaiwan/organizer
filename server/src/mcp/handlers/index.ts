import { Server } from 'socket.io';
import { IMcpToken } from '../../models/McpToken.js';
import { IUser } from '../../models/User.js';
import { McpToolDefinition, McpToolResult } from '../types.js';

import { listRoomsHandler, listRoomsDefinition } from './list-rooms.js';
import { listMessagesHandler, listMessagesDefinition } from './list-messages.js';
import { searchUsersHandler, searchUsersDefinition } from './search-users.js';
import { getUnreadHandler, getUnreadDefinition } from './get-unread.js';
import { sendMessageHandler, sendMessageDefinition } from './send-message.js';
import { listNotesHandler, listNotesDefinition } from './list-notes.js';
import { searchNotesHandler, searchNotesDefinition } from './search-notes.js';
import { getNoteHandler, getNoteDefinition } from './get-note.js';
import { createNoteHandler, createNoteDefinition } from './create-note.js';
import { updateNoteHandler, updateNoteDefinition } from './update-note.js';
import { sendBotMessageHandler, sendBotMessageDefinition } from './send-bot-message.js';
// Memory handlers
import { searchMemoriesHandler, searchMemoriesDefinition } from './search-memories.js';
import { getRecentMemoriesHandler, getRecentMemoriesDefinition } from './get-recent-memories.js';
import { storeMemoryHandler, storeMemoryDefinition } from './store-memory.js';
import { deleteMemoryHandler, deleteMemoryDefinition } from './delete-memory.js';
// Self handlers
import { searchSelfHandler, searchSelfDefinition } from './search-self.js';
import { storeSelfHandler, storeSelfDefinition } from './store-self.js';
import { deleteSelfHandler, deleteSelfDefinition } from './delete-self.js';
// Goals handlers
import { searchGoalsHandler, searchGoalsDefinition } from './search-goals.js';
import { storeGoalHandler, storeGoalDefinition } from './store-goal.js';
import { deleteGoalHandler, deleteGoalDefinition } from './delete-goal.js';

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
  list_notes: listNotesHandler,
  search_notes: searchNotesHandler,
  get_note: getNoteHandler,
  create_note: createNoteHandler,
  update_note: updateNoteHandler,
  send_bot_message: sendBotMessageHandler,
  // Memory
  search_memories: searchMemoriesHandler,
  get_recent_memories: getRecentMemoriesHandler,
  store_memory: storeMemoryHandler,
  delete_memory: deleteMemoryHandler,
  // Self
  search_self: searchSelfHandler,
  store_self: storeSelfHandler,
  delete_self: deleteSelfHandler,
  // Goals
  search_goals: searchGoalsHandler,
  store_goal: storeGoalHandler,
  delete_goal: deleteGoalHandler,
};

const definitions: Record<string, McpToolDefinition> = {
  list_rooms: listRoomsDefinition,
  list_messages: listMessagesDefinition,
  search_users: searchUsersDefinition,
  get_unread: getUnreadDefinition,
  send_message: sendMessageDefinition,
  list_notes: listNotesDefinition,
  search_notes: searchNotesDefinition,
  get_note: getNoteDefinition,
  create_note: createNoteDefinition,
  update_note: updateNoteDefinition,
  send_bot_message: sendBotMessageDefinition,
  // Memory
  search_memories: searchMemoriesDefinition,
  get_recent_memories: getRecentMemoriesDefinition,
  store_memory: storeMemoryDefinition,
  delete_memory: deleteMemoryDefinition,
  // Self
  search_self: searchSelfDefinition,
  store_self: storeSelfDefinition,
  delete_self: deleteSelfDefinition,
  // Goals
  search_goals: searchGoalsDefinition,
  store_goal: storeGoalDefinition,
  delete_goal: deleteGoalDefinition,
};

const WRITE_TOOLS = [
  'send_message', 'create_note', 'update_note', 'send_bot_message',
  'store_memory', 'delete_memory',
  'store_self', 'delete_self',
  'store_goal', 'delete_goal',
];

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
