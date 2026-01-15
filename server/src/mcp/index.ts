import { Router, Response } from 'express';
import { McpRequest, mcpAuthMiddleware } from './auth.js';
import { handleToolCall, getToolDefinitions, isToolAllowed } from './handlers/index.js';
import { McpAuditLog } from '../models/index.js';
import { JsonRpcRequest, JsonRpcResponse, JsonRpcErrorCodes } from './types.js';

const router = Router();

router.use(mcpAuthMiddleware);

function sanitizeParams(params: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...params };
  if (typeof sanitized.content === 'string' && sanitized.content.length > 200) {
    sanitized.content = sanitized.content.substring(0, 200) + '...';
  }
  return sanitized;
}

router.post('/', async (req: McpRequest, res: Response): Promise<void> => {
  const startTime = Date.now();
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'] || null;

  try {
    const body = req.body as JsonRpcRequest;

    if (!body || body.jsonrpc !== '2.0' || !body.method) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: JsonRpcErrorCodes.INVALID_REQUEST, message: 'Invalid JSON-RPC request' },
        id: body?.id || null,
      });
      return;
    }

    const { method, params, id } = body;

    let response: JsonRpcResponse;

    switch (method) {
      case 'initialize':
        response = {
          jsonrpc: '2.0',
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {},
            },
            serverInfo: {
              name: 'organizer-mcp',
              version: '1.0.0',
            },
          },
          id,
        };
        break;

      case 'tools/list':
        response = {
          jsonrpc: '2.0',
          result: {
            tools: getToolDefinitions(req.mcpToken!),
          },
          id,
        };
        break;

      case 'tools/call': {
        const toolName = (params as any)?.name as string;
        const toolArgs = (params as any)?.arguments || {};

        if (!isToolAllowed(req.mcpToken!, toolName)) {
          response = {
            jsonrpc: '2.0',
            error: {
              code: JsonRpcErrorCodes.FORBIDDEN,
              message: `Tool '${toolName}' is not allowed for this token`,
            },
            id,
          };
        } else {
          const result = await handleToolCall(
            toolName,
            toolArgs,
            req.mcpToken!,
            req.mcpUser!,
            req.app.get('io')
          );

          response = {
            jsonrpc: '2.0',
            result,
            id,
          };
        }

        await McpAuditLog.create({
          tokenId: req.mcpToken!._id,
          userId: req.mcpUser!._id,
          action: toolName || 'unknown',
          method,
          params: sanitizeParams(toolArgs),
          result: response.error ? 'error' : 'success',
          errorMessage: response.error?.message || null,
          ip,
          userAgent,
          durationMs: Date.now() - startTime,
        });
        break;
      }

      default:
        response = {
          jsonrpc: '2.0',
          error: { code: JsonRpcErrorCodes.METHOD_NOT_FOUND, message: `Unknown method: ${method}` },
          id,
        };
    }

    res.json(response);
  } catch (error) {
    console.error('MCP handler error:', error);

    await McpAuditLog.create({
      tokenId: req.mcpToken?._id || null,
      userId: req.mcpUser?._id || null,
      action: 'auth_failure',
      method: req.body?.method || 'unknown',
      params: {},
      result: 'error',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      ip,
      userAgent,
      durationMs: Date.now() - startTime,
    });

    res.status(500).json({
      jsonrpc: '2.0',
      error: { code: JsonRpcErrorCodes.INTERNAL_ERROR, message: 'Internal server error' },
      id: req.body?.id || null,
    });
  }
});

export default router;
