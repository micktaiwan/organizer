import { Server } from 'socket.io';
import { createMessage } from '../../services/messages.service.js';
import { getRoomById, ensureUserInRoom, updateRoomLastMessage } from '../../services/rooms.service.js';
import { getUserByUsername } from '../../services/users.service.js';
import { IMcpToken } from '../../models/McpToken.js';
import { IUser } from '../../models/User.js';
import { McpToolDefinition, McpToolResult } from '../types.js';
import { emitNewMessage } from '../../utils/socketEmit.js';

export const sendBotMessageDefinition: McpToolDefinition = {
  name: 'send_bot_message',
  description: 'Send a message as the Test Bot to a chat room.',
  inputSchema: {
    type: 'object',
    properties: {
      channelId: {
        type: 'string',
        description: 'The ID of the channel/room to send the message to. Required.',
      },
      message: {
        type: 'string',
        description: 'The message content. Required. Max 5000 characters.',
      },
    },
    required: ['channelId', 'message'],
  },
};

export async function sendBotMessageHandler(
  args: Record<string, unknown>,
  _token: IMcpToken,
  _user: IUser,
  io?: Server
): Promise<McpToolResult> {
  try {
    const channelId = args.channelId as string;
    const messageContent = args.message as string;

    if (!channelId) {
      return {
        content: [{ type: 'text', text: 'channelId is required' }],
        isError: true,
      };
    }

    if (!messageContent || messageContent.trim().length === 0) {
      return {
        content: [{ type: 'text', text: 'message is required and cannot be empty' }],
        isError: true,
      };
    }

    if (messageContent.length > 5000) {
      return {
        content: [{ type: 'text', text: 'message must be 5000 characters or less' }],
        isError: true,
      };
    }

    const room = await getRoomById(channelId);
    if (!room) {
      return {
        content: [{ type: 'text', text: 'Channel not found' }],
        isError: true,
      };
    }

    const botUser = await getUserByUsername('testbot');
    if (!botUser) {
      return {
        content: [{ type: 'text', text: 'Test Bot user not found in the system' }],
        isError: true,
      };
    }

    await ensureUserInRoom(channelId, botUser._id as any);

    const message = await createMessage({
      roomId: channelId,
      senderId: botUser._id as any,
      content: messageContent,
      clientSource: 'mcp-bot',
    });

    await updateRoomLastMessage(channelId);

    if (io) {
      await emitNewMessage({
        io,
        roomId: channelId,
        userId: botUser._id.toString(),
        message: message as any,
      });
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          messageId: message._id.toString(),
          channelName: room.name,
          sentAs: botUser.displayName,
        }, null, 2),
      }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error sending bot message: ${error}` }],
      isError: true,
    };
  }
}
