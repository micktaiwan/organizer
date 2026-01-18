// Self-knowledge tools
import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import { log } from '../logger.mjs';
import { searchSelfMemory, storeSelfMemory, deleteSelfMemory } from '../memory/self.mjs';

const searchSelfTool = tool(
  'search_self',
  'Cherche ce que tu sais sur toi-même. Utilise category pour filtrer (ex: chercher uniquement les limitations).',
  {
    query: z.string().describe('Ce que tu cherches sur toi-même'),
    category: z.enum(['context', 'capability', 'limitation', 'preference', 'relation']).optional()
      .describe('Optionnel: filtre par type (limitation pour chercher ce que tu ne peux pas faire)')
  },
  async (args) => {
    log('info', `[Tool] 🔍 search_self called`, { query: args.query, category: args.category });

    try {
      const results = await searchSelfMemory(args.query, 10, args.category || null);

      if (results.length === 0) {
        const categoryMsg = args.category ? ` dans la catégorie "${args.category}"` : '';
        return {
          content: [{ type: 'text', text: `Je n'ai rien trouvé sur moi-même${categoryMsg}.` }]
        };
      }

      const formatted = results
        .map(r => `- [${r.payload.selfCategory}] (id: ${r.id}) ${r.payload.content}`)
        .join('\n');

      return {
        content: [{ type: 'text', text: formatted }]
      };
    } catch (error) {
      log('error', `[Tool] search_self error: ${error.message}`);
      return {
        content: [{ type: 'text', text: `Erreur: ${error.message}` }]
      };
    }
  }
);

const storeSelfTool = tool(
  'store_self',
  'Stocke quelque chose que tu as appris sur toi-même. Utilise quand tu découvres une nouvelle info sur ton identité, tes capacités, ou tes préférences.',
  {
    content: z.string().describe('Ce que tu as appris sur toi'),
    category: z.enum(['context', 'capability', 'limitation', 'preference', 'relation'])
      .describe('Type: context (où tu es), capability (ce que tu peux faire), limitation (ce que tu ne peux pas), preference (ce que tu aimes), relation (comment tu perçois quelqu\'un)')
  },
  async (args) => {
    log('info', `[Tool] 💾 store_self called`, { content: args.content, category: args.category });

    try {
      await storeSelfMemory(args.content, args.category);
      return {
        content: [{ type: 'text', text: `Mémorisé sur moi : "${args.content}"` }]
      };
    } catch (error) {
      log('error', `[Tool] store_self error: ${error.message}`);
      return {
        content: [{ type: 'text', text: `Erreur: ${error.message}` }]
      };
    }
  }
);

const deleteSelfTool = tool(
  'delete_self',
  'Supprime une info obsolète sur toi-même. Utilise quand une limitation devient une capability, ou quand une info n\'est plus vraie.',
  {
    id: z.string().describe('L\'ID de l\'item à supprimer (obtenu via search_self)'),
    reason: z.string().describe('Pourquoi tu supprimes cette info')
  },
  async (args) => {
    log('info', `[Tool] 🗑️ delete_self called`, { id: args.id, reason: args.reason });

    try {
      await deleteSelfMemory(args.id);
      return {
        content: [{ type: 'text', text: `Supprimé de ma mémoire (raison: ${args.reason})` }]
      };
    } catch (error) {
      log('error', `[Tool] delete_self error: ${error.message}`);
      return {
        content: [{ type: 'text', text: `Erreur: ${error.message}` }]
      };
    }
  }
);

export { searchSelfTool, storeSelfTool, deleteSelfTool };
