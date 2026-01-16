import { Server } from 'socket.io';
import { Room, Message, User } from '../../models/index.js';
import { IMcpToken } from '../../models/McpToken.js';
import { IUser } from '../../models/User.js';
import { McpToolDefinition, McpToolResult } from '../types.js';
import { emitNewMessage } from '../../utils/socketEmit.js';

export const sendMessageDefinition: McpToolDefinition = {
  name: 'send_message',
  description: 'Send a text message to a chat room. Can send as yourself (admin) or as the bot account.',
  inputSchema: {
    type: 'object',
    properties: {
      roomId: {
        type: 'string',
        description: 'The ID of the room to send the message to. Required.',
      },
      content: {
        type: 'string',
        description: 'The message content. Required. Max 5000 characters.',
      },
      asBot: {
        type: 'boolean',
        description: 'If true, send as the bot account instead of as yourself. Default: false',
      },
    },
    required: ['roomId', 'content'],
  },
};

export async function sendMessageHandler(
  args: Record<string, unknown>,
  _token: IMcpToken,
  user: IUser,
  io?: Server
): Promise<McpToolResult> {
  try {
    const roomId = args.roomId as string;
    const content = args.content as string;
    const asBot = args.asBot as boolean || false;

    if (!roomId) {
      return {
        content: [{ type: 'text', text: 'roomId is required' }],
        isError: true,
      };
    }

    if (!content || content.trim().length === 0) {
      return {
        content: [{ type: 'text', text: 'content is required and cannot be empty' }],
        isError: true,
      };
    }

    if (content.length > 5000) {
      return {
        content: [{ type: 'text', text: 'content must be 5000 characters or less' }],
        isError: true,
      };
    }

    const room = await Room.findById(roomId);
    if (!room) {
      return {
        content: [{ type: 'text', text: 'Room not found' }],
        isError: true,
      };
    }

    let senderId = user._id;
    let senderName = user.displayName;

    if (asBot) {
      const botUser = await User.findOne({ isBot: true });
      if (!botUser) {
        return {
          content: [{ type: 'text', text: 'No bot user found in the system' }],
          isError: true,
        };
      }
      senderId = botUser._id as any;
      senderName = botUser.displayName;

      const botIsMember = room.members.some(m => m.userId.toString() === botUser._id.toString());
      if (!botIsMember) {
        room.members.push({
          userId: botUser._id as any,
          joinedAt: new Date(),
          lastReadAt: null,
        });
        await room.save();
      }
    } else {
      const isMember = room.members.some(m => m.userId.toString() === user._id.toString());
      const isPublic = room.type === 'public' || room.type === 'lobby';

      if (!isMember && !isPublic) {
        return {
          content: [{ type: 'text', text: 'You are not a member of this room' }],
          isError: true,
        };
      }

      if (!isMember && isPublic) {
        room.members.push({
          userId: user._id as any,
          joinedAt: new Date(),
          lastReadAt: null,
        });
        await room.save();
      }
    }

    const message = new Message({
      roomId,
      senderId,
      type: 'text',
      content: content.trim(),
      status: 'sent',
      readBy: [],
      clientSource: 'api',
    });

    await message.save();
    await message.populate('senderId', 'username displayName status statusMessage');

    await Room.findByIdAndUpdate(roomId, { lastMessageAt: new Date() });

    if (io) {
      await emitNewMessage({
        io,
        roomId,
        userId: senderId.toString(),
        message: message as any,
      });
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          messageId: message._id.toString(),
          roomName: room.name,
          sentAs: senderName,
          content: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
        }, null, 2),
      }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error sending message: ${error}` }],
      isError: true,
    };
  }
}
