# Architecture Server

## Vue d'ensemble

Le serveur expose les données via trois points d'accès :

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   MCP Server    │     │   REST API      │     │  Worker Eko    │
│  (Claude Code)  │     │  (App client)   │     │  (Agent SDK)    │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │    Services Layer       │
                    │  (Business Logic)       │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │    Models (Mongoose)    │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │       MongoDB           │
                    └─────────────────────────┘
```

## Couche Services

Les services encapsulent la logique métier et l'accès aux données. Ils sont utilisés par :
- **MCP handlers** : outils exposés à Claude Code
- **Worker Eko** : agent autonome (processus séparé)
- **REST API** : endpoints pour les clients (desktop, mobile)

### Fichiers

| Service | Fonctions | Utilisé par |
|---------|-----------|-------------|
| `notes.service.ts` | `searchNotes`, `getNoteById`, `listNotes`, `createNote`, `updateNote`, `validateLabels` | MCP, Worker |
| `rooms.service.ts` | `listRooms`, `getRoomById`, `userHasAccessToRoom`, `ensureUserInRoom`, `updateRoomLastMessage` | MCP |
| `messages.service.ts` | `listMessages`, `createMessage`, `getBotUser`, `getUnreadCounts` | MCP |
| `users.service.ts` | `searchUsers`, `getUserById`, `getUserByUsername` | MCP |

### Exemple : notes.service.ts

```typescript
// server/src/services/notes.service.ts

export async function searchNotes(query: string, limit = 10) { ... }
export async function getNoteById(id: string) { ... }
export async function listNotes(options: ListNotesOptions) { ... }
```

Utilisé dans MCP :
```typescript
// server/src/mcp/handlers/list-notes.ts
import { listNotes } from '../../services/notes.service.js';

export async function listNotesHandler(args, token, user) {
  const notes = await listNotes({ archived: args.archived, limit: args.limit });
  // ... formatage
}
```

Utilisé dans Worker :
```typescript
// server/src/agent/worker.mjs
import { searchNotes, getNoteById } from '../../dist/services/notes.service.js';

const searchNotesTool = tool('search_notes', ..., async (args) => {
  const notes = await searchNotes(args.query, 10);
  // ... formatage
});
```

## Worker Eko

Le worker tourne dans un **processus séparé** (Agent SDK). Il importe les services compilés depuis `dist/`.

```
server/src/agent/worker.mjs  ──imports──►  server/dist/services/*.js
```

**Important** : Le worker est un fichier `.mjs` qui s'exécute directement (pas compilé par tsc). Il doit importer depuis `../../dist/services/` et non `../services/`.

## MCP Server

Les handlers MCP sont dans `server/src/mcp/handlers/`. Chaque handler :
1. Reçoit les arguments validés
2. Appelle le service approprié
3. Formate la réponse pour Claude

### Handlers disponibles

| Handler | Service | Description |
|---------|---------|-------------|
| `list-notes.ts` | notes | Liste les notes |
| `get-note.ts` | notes | Détail d'une note |
| `create-note.ts` | notes | Crée une note |
| `update-note.ts` | notes | Modifie une note |
| `list-rooms.ts` | rooms | Liste les rooms |
| `list-messages.ts` | messages | Messages d'une room |
| `send-message.ts` | messages | Envoie un message |
| `send-bot-message.ts` | messages | Message via bot |
| `search-users.ts` | users | Recherche users |
| `get-unread.ts` | messages | Compteur non-lus |

## Conventions

### Nommage
- Services : `<entity>.service.ts`
- MCP handlers : `<action>-<entity>.ts`
- Fonctions : `verbNoun` (ex: `listNotes`, `getNoteById`)

### Imports dans le Worker
```javascript
// CORRECT - depuis dist (fichiers compilés)
import { searchNotes } from '../../dist/services/notes.service.js';

// INCORRECT - src contient du TypeScript
import { searchNotes } from '../services/notes.service.js';
```

### Retours des services
- Retourner des données brutes (pas de formatage MCP/API)
- Le formatage est fait par l'appelant (handler MCP ou route API)
- Utiliser `.lean()` pour les queries Mongoose quand possible
