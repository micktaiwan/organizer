import { Router, Response } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { agentService } from '../agent/index.js';
import { getCollectionInfo, listMemories, deleteMemory } from '../memory/index.js';

const router = Router();

// Lightweight health check - no LLM call, just checks worker is running
router.get('/health', authMiddleware, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const isHealthy = await agentService.ping();
    if (isHealthy) {
      res.json({ status: 'ok' });
    } else {
      res.status(503).json({ status: 'unavailable', error: 'Worker not ready' });
    }
  } catch (error) {
    res.status(503).json({ status: 'error', error: (error as Error).message });
  }
});

const askSchema = z.object({
  question: z.string().min(1).max(500),
});

// Build context JSON for the pet
function buildMessageContext(req: AuthRequest, message: string): object {
  const now = new Date();
  const user = req.user;

  const context: Record<string, unknown> = {
    type: 'direct',
    from: user?.username || 'unknown',
    message,
    time: now.toLocaleString('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
  };

  // Add location if available
  if (user?.location) {
    const loc = user.location;
    const parts = [loc.street, loc.city, loc.country].filter(Boolean);
    if (parts.length > 0) {
      context.location = parts.join(', ');
    }
  }

  // Add status message if set
  if (user?.statusMessage) {
    context.statusMessage = user.statusMessage;
  }

  return context;
}

router.post('/ask', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { question } = askSchema.parse(req.body);
    const context = buildMessageContext(req, question);

    console.log(`[Agent] User ${req.user?.username} asked: "${question}"`);

    // Send JSON context to the pet
    const prompt = JSON.stringify(context, null, 2);
    const { response, expression } = await agentService.ask(prompt);

    console.log(`[Agent] Response: "${response}" (expression: ${expression})`);

    res.json({
      response,
      expression,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Question invalide', details: error.errors });
      return;
    }
    console.error('[Agent] Error:', error);
    res.status(500).json({ error: 'Erreur lors de la génération de réponse' });
  }
});

router.post('/reset', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await agentService.resetSession();
    console.log(`[Agent] Session reset by ${req.user?.username}`);
    res.json({ success: true });
  } catch (error) {
    console.error('[Agent] Reset error:', error);
    res.status(500).json({ error: 'Erreur lors du reset de session' });
  }
});

router.get('/memory/info', authMiddleware, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const info = await getCollectionInfo();
    res.json(info);
  } catch (error) {
    console.error('[Agent] Memory info error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des infos mémoire' });
  }
});

router.get('/memory/list', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = req.query.offset as string | undefined;
    const result = await listMemories(limit, offset);
    res.json({
      memories: result.points,
      nextOffset: result.nextOffset,
      count: result.points.length,
    });
  } catch (error) {
    console.error('[Agent] Memory list error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des mémoires' });
  }
});

router.delete('/memory/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await deleteMemory(id);
    res.json({ success: true });
  } catch (error) {
    console.error('[Agent] Memory delete error:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
});

export default router;
