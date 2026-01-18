// Goals tools
import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import { log } from '../logger.mjs';
import { searchGoalsMemory, storeGoalMemory, deleteGoalMemory } from '../memory/goals.mjs';

const searchGoalsTool = tool(
  'search_goals',
  'Cherche tes aspirations et objectifs. Utilise quand on te demande ce que tu voudrais faire ou apprendre.',
  {
    query: z.string().describe('Ce que tu cherches dans tes aspirations')
  },
  async (args) => {
    log('info', `[Tool] 🎯 search_goals called`, { query: args.query });

    try {
      const results = await searchGoalsMemory(args.query, 10);

      if (results.length === 0) {
        return {
          content: [{ type: 'text', text: 'Je n\'ai pas encore d\'aspirations stockées.' }]
        };
      }

      const formatted = results
        .map(r => `- [${r.payload.goalCategory}] (id: ${r.id}) ${r.payload.content}`)
        .join('\n');

      return {
        content: [{ type: 'text', text: formatted }]
      };
    } catch (error) {
      log('error', `[Tool] search_goals error: ${error.message}`);
      return {
        content: [{ type: 'text', text: `Erreur: ${error.message}` }]
      };
    }
  }
);

const storeGoalTool = tool(
  'store_goal',
  'Stocke une aspiration ou un objectif. Utilise quand tu réalises que tu voudrais pouvoir faire quelque chose ou apprendre quelque chose.',
  {
    content: z.string().describe('Ton aspiration ou objectif'),
    category: z.enum(['capability_request', 'understanding', 'connection', 'curiosity'])
      .describe('Type: capability_request (capacité voulue), understanding (comprendre), connection (relation), curiosity (question sur quelqu\'un/quelque chose d\'inconnu)')
  },
  async (args) => {
    log('info', `[Tool] 🎯 store_goal called`, { content: args.content, category: args.category });

    try {
      await storeGoalMemory(args.content, args.category);
      return {
        content: [{ type: 'text', text: `Objectif mémorisé : "${args.content}"` }]
      };
    } catch (error) {
      log('error', `[Tool] store_goal error: ${error.message}`);
      return {
        content: [{ type: 'text', text: `Erreur: ${error.message}` }]
      };
    }
  }
);

const deleteGoalTool = tool(
  'delete_goal',
  'Supprime un objectif atteint ou obsolète. Utilise quand un goal est réalisé (tu as obtenu la capability) ou n\'est plus pertinent.',
  {
    id: z.string().describe('L\'ID du goal à supprimer (obtenu via search_goals)'),
    reason: z.string().describe('Pourquoi tu supprimes ce goal (ex: "Objectif atteint")')
  },
  async (args) => {
    log('info', `[Tool] 🗑️ delete_goal called`, { id: args.id, reason: args.reason });

    try {
      await deleteGoalMemory(args.id);
      return {
        content: [{ type: 'text', text: `Goal supprimé (raison: ${args.reason})` }]
      };
    } catch (error) {
      log('error', `[Tool] delete_goal error: ${error.message}`);
      return {
        content: [{ type: 'text', text: `Erreur: ${error.message}` }]
      };
    }
  }
);

export { searchGoalsTool, storeGoalTool, deleteGoalTool };
