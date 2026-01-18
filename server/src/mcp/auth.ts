import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { McpToken, IMcpToken, User, IUser } from '../models/index.js';

export interface McpRequest extends Request {
  mcpToken?: IMcpToken;
  mcpUser?: IUser;
}

// In-memory rate limit tracking (per token)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateMcpToken(): { token: string; prefix: string; hash: string } {
  const randomPart = crypto.randomBytes(32).toString('hex');
  const token = `mcp_${randomPart}`;
  const prefix = token.substring(0, 12) + '...';
  const hash = hashToken(token);
  return { token, prefix, hash };
}

export async function mcpAuthMiddleware(
  req: McpRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Missing or invalid Authorization header' },
        id: null,
      });
      return;
    }

    const token = authHeader.split(' ')[1];
    if (!token.startsWith('mcp_')) {
      res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Invalid token format' },
        id: null,
      });
      return;
    }

    const tokenHash = hashToken(token);
    const mcpToken = await McpToken.findOne({
      token: tokenHash,
      isRevoked: false,
    });

    if (!mcpToken) {
      res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Invalid or revoked token' },
        id: null,
      });
      return;
    }

    if (mcpToken.expiresAt && mcpToken.expiresAt < new Date()) {
      res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Token has expired' },
        id: null,
      });
      return;
    }

    const user = await User.findById(mcpToken.userId).select('-passwordHash');
    if (!user || !user.isAdmin) {
      res.status(403).json({
        jsonrpc: '2.0',
        error: { code: -32003, message: 'Token owner is not an admin' },
        id: null,
      });
      return;
    }

    // Rate limiting
    const now = Date.now();
    const tokenId = mcpToken._id.toString();
    let rateInfo = rateLimitMap.get(tokenId);

    if (!rateInfo || rateInfo.resetAt < now) {
      rateInfo = { count: 1, resetAt: now + 60000 };
      rateLimitMap.set(tokenId, rateInfo);
    } else {
      rateInfo.count++;
      if (rateInfo.count > mcpToken.rateLimit) {
        res.status(429).json({
          jsonrpc: '2.0',
          error: {
            code: -32005,
            message: `Rate limit exceeded (${mcpToken.rateLimit}/min)`,
            data: { retryAfter: Math.ceil((rateInfo.resetAt - now) / 1000) },
          },
          id: null,
        });
        return;
      }
    }

    await McpToken.findByIdAndUpdate(mcpToken._id, {
      lastUsedAt: new Date(),
      lastUsedIp: ip,
    });

    req.mcpToken = mcpToken;
    req.mcpUser = user;

    next();
  } catch (error) {
    console.error('MCP auth error:', error);
    res.status(500).json({
      jsonrpc: '2.0',
      error: { code: -32603, message: 'Internal authentication error' },
      id: null,
    });
  }
}
