import { Router, Response } from 'express';
import { z } from 'zod';
import { authMiddleware, adminMiddleware, AuthRequest } from '../middleware/auth.js';
import { McpToken, McpAuditLog } from '../models/index.js';
import { generateMcpToken } from '../mcp/auth.js';

const router = Router();

router.use(authMiddleware);
router.use(adminMiddleware);

const createTokenSchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.enum(['read', 'write'])).default(['read']),
  allowedTools: z.array(z.string()).default(['*']),
  rateLimit: z.number().min(1).max(1000).default(60),
  expiresIn: z.number().optional(),
});

router.post('/tokens', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = createTokenSchema.parse(req.body);

    const { token, prefix, hash } = generateMcpToken();

    const expiresAt = data.expiresIn
      ? new Date(Date.now() + data.expiresIn * 24 * 60 * 60 * 1000)
      : null;

    const mcpToken = new McpToken({
      token: hash,
      tokenPrefix: prefix,
      name: data.name,
      userId: req.userId,
      scopes: data.scopes,
      allowedTools: data.allowedTools,
      rateLimit: data.rateLimit,
      expiresAt,
    });

    await mcpToken.save();

    res.status(201).json({
      success: true,
      token,
      tokenInfo: {
        id: mcpToken._id,
        name: mcpToken.name,
        prefix: mcpToken.tokenPrefix,
        scopes: mcpToken.scopes,
        allowedTools: mcpToken.allowedTools,
        rateLimit: mcpToken.rateLimit,
        expiresAt: mcpToken.expiresAt,
        createdAt: mcpToken.createdAt,
      },
      warning: 'Save this token now. It will not be shown again.',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid data', details: error.errors });
      return;
    }
    console.error('Create MCP token error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/tokens', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tokens = await McpToken.find({ userId: req.userId })
      .select('-token')
      .sort({ createdAt: -1 });

    res.json({
      tokens: tokens.map(t => ({
        id: t._id,
        name: t.name,
        prefix: t.tokenPrefix,
        scopes: t.scopes,
        allowedTools: t.allowedTools,
        rateLimit: t.rateLimit,
        isRevoked: t.isRevoked,
        expiresAt: t.expiresAt,
        lastUsedAt: t.lastUsedAt,
        lastUsedIp: t.lastUsedIp,
        createdAt: t.createdAt,
      })),
    });
  } catch (error) {
    console.error('List MCP tokens error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/tokens/:id/revoke', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const token = await McpToken.findOne({
      _id: req.params.id,
      userId: req.userId,
    });

    if (!token) {
      res.status(404).json({ error: 'Token not found' });
      return;
    }

    if (token.isRevoked) {
      res.status(400).json({ error: 'Token is already revoked' });
      return;
    }

    token.isRevoked = true;
    await token.save();

    res.json({ success: true, message: 'Token revoked' });
  } catch (error) {
    console.error('Revoke MCP token error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/tokens/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await McpToken.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId,
    });

    if (!result) {
      res.status(404).json({ error: 'Token not found' });
      return;
    }

    res.json({ success: true, message: 'Token deleted' });
  } catch (error) {
    console.error('Delete MCP token error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/audit', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const tokenId = req.query.tokenId as string;

    const query: Record<string, unknown> = { userId: req.userId };
    if (tokenId) {
      query.tokenId = tokenId;
    }

    const logs = await McpAuditLog.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('tokenId', 'name tokenPrefix');

    res.json({
      logs: logs.map(log => ({
        id: log._id,
        tokenName: (log.tokenId as any)?.name || 'Unknown',
        tokenPrefix: (log.tokenId as any)?.tokenPrefix || '???',
        action: log.action,
        method: log.method,
        result: log.result,
        errorMessage: log.errorMessage,
        ip: log.ip,
        durationMs: log.durationMs,
        createdAt: log.createdAt,
      })),
    });
  } catch (error) {
    console.error('Get MCP audit logs error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
