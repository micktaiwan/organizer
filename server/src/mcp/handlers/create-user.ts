import bcrypt from 'bcrypt';
import { User, McpToken } from '../../models/index.js';
import { IMcpToken } from '../../models/McpToken.js';
import { IUser } from '../../models/User.js';
import { McpToolDefinition, McpToolResult } from '../types.js';
import { generateMcpToken } from '../auth.js';

export const createUserDefinition: McpToolDefinition = {
  name: 'create_user',
  description: 'Create a new user account. Requires admin privileges (via MCP token owner).',
  inputSchema: {
    type: 'object',
    properties: {
      username: {
        type: 'string',
        description: 'Username (3-30 chars, alphanumeric + underscore only).',
      },
      displayName: {
        type: 'string',
        description: 'Display name (1-50 chars).',
      },
      email: {
        type: 'string',
        description: 'Email address.',
      },
      password: {
        type: 'string',
        description: 'Password (6-100 chars).',
      },
    },
    required: ['username', 'displayName', 'email', 'password'],
  },
};

export async function createUserHandler(
  args: Record<string, unknown>,
  _token: IMcpToken,
  user: IUser
): Promise<McpToolResult> {
  try {
    if (!user.isAdmin) {
      return {
        content: [{ type: 'text', text: 'Only admins can create users' }],
        isError: true,
      };
    }

    const username = args.username as string;
    const displayName = args.displayName as string;
    const email = args.email as string;
    const password = args.password as string;

    // Validate
    if (!username || username.length < 3 || username.length > 30 || !/^[a-zA-Z0-9_]+$/.test(username)) {
      return {
        content: [{ type: 'text', text: 'Username must be 3-30 chars, alphanumeric + underscore only' }],
        isError: true,
      };
    }
    if (!displayName || displayName.length < 1 || displayName.length > 50) {
      return {
        content: [{ type: 'text', text: 'Display name must be 1-50 chars' }],
        isError: true,
      };
    }
    if (!email || !email.includes('@')) {
      return {
        content: [{ type: 'text', text: 'Invalid email address' }],
        isError: true,
      };
    }
    if (!password || password.length < 6 || password.length > 100) {
      return {
        content: [{ type: 'text', text: 'Password must be 6-100 chars' }],
        isError: true,
      };
    }

    // Check for existing user
    const existingUser = await User.findOne({
      $or: [
        { username: username.toLowerCase() },
        { email: email.toLowerCase() },
      ],
    });

    if (existingUser) {
      const field = existingUser.username === username.toLowerCase() ? 'username' : 'email';
      return {
        content: [{ type: 'text', text: `A user with this ${field} already exists` }],
        isError: true,
      };
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const newUser = new User({
      username: username.toLowerCase(),
      displayName,
      email: email.toLowerCase(),
      passwordHash,
      isAdmin: false,
    });

    await newUser.save();

    // Generate a personal MCP token
    const { token: mcpRawToken, prefix, hash } = generateMcpToken();
    const mcpToken = new McpToken({
      token: hash,
      tokenPrefix: prefix,
      name: `auto-${newUser.username}`,
      userId: newUser._id,
      scopes: ['read', 'write'],
      allowedTools: ['*'],
      rateLimit: 60,
      expiresAt: null,
    });
    await mcpToken.save();

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          user: {
            id: newUser._id.toString(),
            username: newUser.username,
            displayName: newUser.displayName,
            email: newUser.email,
            isAdmin: newUser.isAdmin,
          },
          apiKey: mcpRawToken,
        }, null, 2),
      }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error creating user: ${error}` }],
      isError: true,
    };
  }
}
