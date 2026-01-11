# Plan: Agent Intelligent pour Organizer

## Vision

Transformer Organizer en une plateforme avec un agent IA capable de:
- Répondre à des questions sur les notes (base de connaissances)
- Effectuer des recherches sémantiques
- Être accessible via MCP par Claude Code et autres clients

## Architecture en 3 Phases

```
Phase 1: MCP Server          Phase 2: Qdrant           Phase 3: Agent Chat
─────────────────────       ─────────────────────     ─────────────────────
│ JSON-RPC Handler  │       │ Embeddings OpenAI │     │ Boucle Agentique  │
│ HTTP Routes /mcp  │  -->  │ Indexation Notes  │ --> │ Tools + Claude    │
│ Tools basiques    │       │ Recherche Vecteur │     │ Interface Chat    │
─────────────────────       ─────────────────────     ─────────────────────
```

---

## Phase 1: Serveur MCP (Priorité)

### Objectif
Exposer les fonctionnalités d'Organizer via le protocole MCP (JSON-RPC 2.0).

### Fichiers à créer

#### 1. `server/src/mcp/protocol.ts`
Handler JSON-RPC 2.0:
- `initialize` - Handshake avec capabilities
- `tools/list` - Liste des outils disponibles
- `tools/call` - Exécution d'un outil

#### 2. `server/src/mcp/routes.ts`
Routes HTTP:
- `GET /mcp/health` - Health check
- `POST /mcp` - Endpoint JSON-RPC principal

#### 3. `server/src/mcp/tools/definitions.ts`
Définitions des outils (schéma OpenAI function-calling):
```typescript
export const MCP_TOOLS = [
  {
    name: 'notes_list',
    description: 'Liste les notes avec filtres optionnels',
    inputSchema: {
      type: 'object',
      properties: {
        labelId: { type: 'string', description: 'Filtrer par label' },
        archived: { type: 'boolean', description: 'Inclure archivées' },
        limit: { type: 'number', description: 'Nombre max de résultats' }
      }
    }
  },
  {
    name: 'notes_read',
    description: 'Lit le contenu complet d\'une note',
    inputSchema: {
      type: 'object',
      properties: {
        noteId: { type: 'string', description: 'ID de la note' }
      },
      required: ['noteId']
    }
  },
  {
    name: 'notes_search',
    description: 'Recherche dans les notes (texte simple pour l\'instant)',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Terme de recherche' }
      },
      required: ['query']
    }
  },
  {
    name: 'labels_list',
    description: 'Liste tous les labels disponibles',
    inputSchema: { type: 'object', properties: {} }
  }
]
```

#### 4. `server/src/mcp/tools/handlers.ts`
Implémentation des outils:
```typescript
export const TOOL_HANDLERS = {
  notes_list: async (args) => { /* query MongoDB */ },
  notes_read: async (args) => { /* fetch note by ID */ },
  notes_search: async (args) => { /* regex search */ },
  labels_list: async () => { /* list labels */ },
}
```

### Fichiers à modifier

#### 5. `server/src/index.ts`
Importer et monter les routes MCP:
```typescript
import mcpRoutes from './mcp/routes.js';
app.use('/mcp', mcpRoutes);
```

### Structure finale Phase 1
```
server/src/mcp/
├── protocol.ts      # JSON-RPC handler
├── routes.ts        # HTTP routes
└── tools/
    ├── definitions.ts
    └── handlers.ts
```

### Test Phase 1
```bash
# Health check
curl http://localhost:3001/mcp/health

# Liste des outils
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Appel d'outil
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"notes_list","arguments":{}}}'
```

---

## Phase 2: Intégration Qdrant (Après Phase 1)

### Objectif
Ajouter la recherche sémantique sur les notes.

### Prérequis
- Qdrant en Docker
- Clé API OpenAI pour embeddings

### Fichiers à créer

#### 1. `server/src/search/qdrant.ts`
Client Qdrant:
- Configuration et connexion
- Création de collection (1536 dimensions, Cosine)

#### 2. `server/src/search/embeddings.ts`
Génération d'embeddings via OpenAI:
```typescript
const model = 'text-embedding-3-small';
// 1536 dimensions
```

#### 3. `server/src/search/vectorStore.ts`
Opérations sur les vecteurs:
- `upsertNote(note)` - Indexer une note
- `deleteNote(noteId)` - Supprimer du vecteur
- `search(query, limit)` - Recherche sémantique

#### 4. `server/src/search/indexer.ts`
Job d'indexation:
- Indexation initiale de toutes les notes
- Hooks sur CRUD pour mise à jour incrémentale

### Fichiers à modifier

#### 5. `server/docker-compose.yml`
Ajouter service Qdrant:
```yaml
qdrant:
  image: qdrant/qdrant:latest
  ports:
    - "6333:6333"
  volumes:
    - qdrant_data:/qdrant/storage
```

#### 6. `server/src/mcp/tools/definitions.ts`
Ajouter outil de recherche sémantique:
```typescript
{
  name: 'notes_semantic_search',
  description: 'Recherche sémantique dans les notes',
  inputSchema: {
    properties: {
      query: { type: 'string' },
      limit: { type: 'number', default: 5 }
    },
    required: ['query']
  }
}
```

#### 7. `.env`
```
QDRANT_URL=http://localhost:6333
OPENAI_API_KEY=sk-...
```

---

## Phase 3: Agent Conversationnel (Après Phase 2)

### Objectif
Bot dans le chat qui utilise les outils MCP pour répondre.

### Architecture
Inspirée de Panorama `claudeAgent.js`:
- Boucle agentique (max 10 itérations)
- Exécution parallèle des outils
- Streaming des réponses

### Fichiers à créer

#### 1. `server/src/agent/loop.ts`
Boucle agentique:
```typescript
async function runAgent(query: string, options: AgentOptions) {
  const messages = [{ role: 'user', content: query }];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await claude.messages.create({
      model: 'claude-sonnet-4-20250514',
      system: SYSTEM_PROMPT,
      messages,
      tools: MCP_TOOLS,
    });

    if (response.stop_reason === 'end_turn') {
      return extractText(response);
    }

    // Exécuter les outils en parallèle
    const results = await executeTools(response.tool_calls);
    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: results });
  }
}
```

#### 2. `server/src/agent/prompts.ts`
System prompts pour l'agent.

#### 3. `server/src/services/bot/index.ts`
Intégration avec le chat:
- Détection mention @orga
- Appel de `runAgent()`
- Envoi de la réponse

### Hook dans messages.ts
Après `emitNewMessage()`:
```typescript
if (isBotMentioned(message.content)) {
  processAgentQuery({ io, roomId, message }).catch(console.error);
}
```

---

## Variables d'environnement (Toutes phases)

```env
# Phase 1 - MCP
# (aucune variable requise)

# Phase 2 - Qdrant
QDRANT_URL=http://localhost:6333
OPENAI_API_KEY=sk-...

# Phase 3 - Agent
ANTHROPIC_API_KEY=sk-ant-...
```

---

## Ordre d'implémentation recommandé

### Phase 1.1 - Infrastructure MCP
1. Créer `server/src/mcp/protocol.ts` (JSON-RPC handler)
2. Créer `server/src/mcp/routes.ts` (HTTP endpoints)
3. Monter dans `index.ts`
4. Tester avec curl

### Phase 1.2 - Tools basiques
5. Créer `tools/definitions.ts` (notes_list, notes_read, labels_list)
6. Créer `tools/handlers.ts` (implémentation)
7. Ajouter notes_search (regex simple)
8. Tester chaque tool via MCP

### Phase 2.1 - Qdrant Setup
9. Ajouter Qdrant au docker-compose
10. Créer client Qdrant et embeddings
11. Créer vectorStore

### Phase 2.2 - Indexation
12. Créer indexer avec job tracking
13. Hook sur CRUD notes
14. Ajouter tool notes_semantic_search

### Phase 3 - Agent
15. Créer boucle agentique
16. Intégrer dans le chat via @orga
17. Tester end-to-end

---

## Vérification finale

1. **MCP fonctionne**: `curl POST /mcp` retourne les outils
2. **Tools fonctionnent**: notes_list, notes_read, notes_search
3. **Qdrant indexe**: toutes les notes indexées
4. **Recherche sémantique**: requêtes naturelles trouvent les bonnes notes
5. **Agent répond**: `@orga liste les todos de la note Android` fonctionne
