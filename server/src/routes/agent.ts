import { Router, Response } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { agentService } from '../agent/index.js';

const router = Router();

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

export default router;
