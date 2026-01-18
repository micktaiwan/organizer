// Memory tools (facts about users/world)
import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import { log } from '../logger.mjs';
import { searchFacts, getRecentMemories, storeFactMemory, deleteFactMemory } from '../memory/facts.mjs';

const searchMemoriesTool = tool(
  'search_memories',
  'Cherche dans ta mémoire par similarité sémantique. Utilise pour retrouver des faits sur une personne, un sujet, etc.',
  {
    query: z.string().describe('Ce que tu cherches (nom, sujet, question)')
  },
  async (args) => {
    log('info', `[Tool] 🔍 search_memories called`, { query: args.query });

    try {
      const results = await searchFacts(args.query, 10);

      if (results.length === 0) {
        log('info', '[Tool] No memories found');
        return {
          content: [{ type: 'text', text: 'Aucun souvenir trouvé.' }]
        };
      }

      // Pas de seuil - les résultats sont déjà triés par score décroissant
      const formatted = results
        .map(r => `- (id: ${r.id}) ${r.payload.content} (subjects: ${r.payload.subjects?.join(', ') || 'aucun'})`)
        .join('\n');

      log('info', `[Tool] Returning ${results.length} memories (sorted by relevance)`);

      return {
        content: [{ type: 'text', text: formatted || 'Aucun souvenir pertinent trouvé.' }]
      };
    } catch (error) {
      log('error', `[Tool] search_memories error: ${error.message}`);
      return {
        content: [{ type: 'text', text: `Erreur: ${error.message}` }]
      };
    }
  }
);

const getRecentMemoriesTool = tool(
  'get_recent_memories',
  'Récupère les derniers faits stockés. Utile pour avoir un aperçu général ou répondre à "de quoi on a parlé ?"',
  {
    limit: z.number().min(1).max(20).default(10).describe('Nombre de souvenirs à récupérer (1-20)')
  },
  async (args) => {
    log('info', `[Tool] 📋 get_recent_memories called`, { limit: args.limit });

    try {
      const results = await getRecentMemories(args.limit);

      if (results.length === 0) {
        log('info', '[Tool] No recent memories');
        return {
          content: [{ type: 'text', text: 'Aucun souvenir stocké.' }]
        };
      }

      const formatted = results
        .map(r => `- ${r.content} (subjects: ${r.subjects?.join(', ') || 'aucun'})`)
        .join('\n');

      log('info', `[Tool] Returning ${results.length} recent memories`);

      return {
        content: [{ type: 'text', text: formatted }]
      };
    } catch (error) {
      log('error', `[Tool] get_recent_memories error: ${error.message}`);
      return {
        content: [{ type: 'text', text: `Erreur: ${error.message}` }]
      };
    }
  }
);
const storeMemoryTool = tool(
  'store_memory',
  'Stocke un fait important sur le monde ou les utilisateurs. Relations, événements de vie, préférences des gens.',
  {
    content: z.string().describe('Le fait à retenir'),
    subjects: z.array(z.string()).describe('Tags : noms de personnes, lieux, sujets'),
    ttl: z.enum(['7d', '30d', '90d']).nullable().describe('7d=temporaire, 30d=moyen terme, 90d=long terme, null=permanent')
  },
  async (args) => {
    log('info', `[Tool] 💾 store_memory called`, { content: args.content, subjects: args.subjects, ttl: args.ttl });

    try {
      await storeFactMemory(args.content, args.subjects, args.ttl);
      return {
        content: [{ type: 'text', text: `Fait mémorisé : "${args.content}"` }]
      };
    } catch (error) {
      log('error', `[Tool] store_memory error: ${error.message}`);
      return {
        content: [{ type: 'text', text: `Erreur: ${error.message}` }]
      };
    }
  }
);

const deleteMemoryTool = tool(
  'delete_memory',
  'Supprime un fait de ta mémoire. Utilise quand quelqu\'un te demande d\'oublier quelque chose ou quand une info n\'est plus vraie.',
  {
    id: z.string().describe('L\'ID du fait à supprimer (obtenu via search_memories)'),
    reason: z.string().describe('Pourquoi tu supprimes ce fait')
  },
  async (args) => {
    log('info', `[Tool] 🗑️ delete_memory called`, { id: args.id, reason: args.reason });

    try {
      await deleteFactMemory(args.id);
      return {
        content: [{ type: 'text', text: `Fait oublié (raison: ${args.reason})` }]
      };
    } catch (error) {
      log('error', `[Tool] delete_memory error: ${error.message}`);
      return {
        content: [{ type: 'text', text: `Erreur: ${error.message}` }]
      };
    }
  }
);

export { searchMemoriesTool, getRecentMemoriesTool, storeMemoryTool, deleteMemoryTool };
