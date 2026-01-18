// Notes tools
import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import { searchNotes, getNoteById } from '../../../dist/services/notes.service.js';
import { log } from '../logger.mjs';
import { ensureMongoConnection } from '../db/mongodb.mjs';

const searchNotesTool = tool(
  'search_notes',
  'Recherche dans les notes par mot-clé (titre et contenu). Utilise pour trouver des informations stockées dans les notes.',
  {
    query: z.string().describe('Mot-clé ou phrase à rechercher dans les notes')
  },
  async (args) => {
    log('info', `[Tool] 📝 search_notes called`, { query: args.query });

    try {
      await ensureMongoConnection();
      const notes = await searchNotes(args.query, 10);

      if (notes.length === 0) {
        log('info', '[Tool] No notes found');
        return {
          content: [{ type: 'text', text: 'Aucune note trouvée pour cette recherche.' }]
        };
      }

      const formatted = notes.map(n => {
        let preview = n.content || '';
        if (n.type === 'checklist' && n.items?.length > 0) {
          preview = n.items.map(i => `${i.checked ? '✓' : '○'} ${i.text}`).join(', ');
        }
        preview = preview.slice(0, 100) + (preview.length > 100 ? '...' : '');
        return `- [${n._id}] "${n.title || 'Sans titre'}" : ${preview}`;
      }).join('\n');

      log('info', `[Tool] Found ${notes.length} notes`);

      return {
        content: [{ type: 'text', text: formatted }]
      };
    } catch (error) {
      log('error', `[Tool] search_notes error: ${error.message}`);
      return {
        content: [{ type: 'text', text: `Erreur: ${error.message}` }]
      };
    }
  }
);

const getNoteTool = tool(
  'get_note',
  'Récupère le contenu complet d\'une note par son ID. Utilise après search_notes pour lire le détail.',
  {
    noteId: z.string().describe('ID de la note (format MongoDB ObjectId)')
  },
  async (args) => {
    log('info', `[Tool] 📄 get_note called`, { noteId: args.noteId });

    try {
      await ensureMongoConnection();
      const note = await getNoteById(args.noteId);

      if (!note) {
        log('info', '[Tool] Note not found');
        return {
          content: [{ type: 'text', text: 'Note non trouvée.' }]
        };
      }

      let content = `Titre: ${note.title || 'Sans titre'}\n`;
      content += `Type: ${note.type}\n`;
      content += `Créée le: ${new Date(note.createdAt).toLocaleDateString('fr-FR')}\n\n`;

      if (note.type === 'checklist' && note.items?.length > 0) {
        content += 'Checklist:\n';
        note.items.forEach(item => {
          content += `${item.checked ? '✓' : '○'} ${item.text}\n`;
        });
      } else if (note.content) {
        content += `Contenu:\n${note.content}`;
      }

      log('info', `[Tool] Note retrieved: "${note.title || 'Sans titre'}"`);

      return {
        content: [{ type: 'text', text: content }]
      };
    } catch (error) {
      log('error', `[Tool] get_note error: ${error.message}`);
      return {
        content: [{ type: 'text', text: `Erreur: ${error.message}` }]
      };
    }
  }
);

export { searchNotesTool, getNoteTool };
