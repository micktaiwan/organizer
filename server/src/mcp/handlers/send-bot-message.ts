import { Server } from 'socket.io';
import { Room, Message, User } from '../../models/index.js';
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

    const room = await Room.findById(channelId);
    if (!room) {
      return {
        content: [{ type: 'text', text: 'Channel not found' }],
        isError: true,
      };
    }

    const botUser = await User.findOne({ username: 'testbot' });
    if (!botUser) {
      return {
        content: [{ type: 'text', text: 'Test Bot user not found in the system' }],
        isError: true,
      };
    }

    const botIsMember = room.members.some(m => m.userId.toString() === botUser._id.toString());
    if (!botIsMember) {
      room.members.push({
        userId: botUser._id as any,
        joinedAt: new Date(),
        lastReadAt: null,
      });
      await room.save();
    }

    const message = new Message({
      roomId: channelId,
      senderId: botUser._id,
      type: 'text',
      content: messageContent.trim(),
      status: 'sent',
      readBy: [],
    });

    await message.save();
    await message.populate('senderId', 'username displayName status statusMessage');

    await Room.findByIdAndUpdate(channelId, { lastMessageAt: new Date() });

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
