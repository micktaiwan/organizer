// Respond tool for agent responses
import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import { log } from '../logger.mjs';

// These will be set by the worker
let currentRequest = null;
let send = null;

export function setRequestContext(req, sendFn) {
  currentRequest = req;
  send = sendFn;
}

const respondTool = tool(
  'respond',
  "Utilise cet outil pour répondre à l'humain. Tu DOIS toujours utiliser cet outil pour donner ta réponse finale.",
  {
    expression: z.enum(['neutral', 'happy', 'laughing', 'surprised', 'sad', 'sleepy', 'curious'])
      .describe("L'expression faciale qui correspond à ton émotion"),
    message: z.string()
      .describe('Ta réponse (1-2 phrases courtes, sans markdown)')
  },
  async (args) => {
    // Prevent multiple respond calls - only the first one counts
    if (currentRequest.hasResponded) {
      log('warn', `[Tool] ⚠️ respond called again, ignoring (already responded)`);
      return {
        content: [{ type: 'text', text: 'ERREUR: Tu as déjà répondu à CE message. N\'appelle respond qu\'une seule fois par message reçu ; au message suivant, tu devras l\'appeler à nouveau.' }]
      };
    }

    log('info', `[Tool] 💬 respond called`, {
      expression: args.expression,
      message: args.message.slice(0, 50) + (args.message.length > 50 ? '...' : '')
    });

    currentRequest.hasResponded = true;
    currentRequest.responseData = {
      expression: args.expression,
      message: args.message
    };
    send({ type: 'text', text: args.message, requestId: currentRequest.requestId });
    return {
      content: [{ type: 'text', text: `Réponse envoyée (${args.expression}). STOP pour ce message : n'appelle plus aucun outil maintenant. Au prochain message reçu, tu recommences et tu termines par respond().` }]
    };
  }
);

export { respondTool };
