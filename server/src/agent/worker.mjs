#!/usr/bin/env node
import { query, tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import * as readline from 'readline';
import { z } from 'zod';

// =============================================================================
// CONFIGURATION
// =============================================================================

const QDRANT_URL = process.env.QDRANT_URL || 'http://qdrant:6333';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MONGODB_URI = process.env.MONGODB_URI;
const COLLECTION_NAME = 'organizer_memory';
const LIVE_COLLECTION_NAME = 'organizer_live';
const SELF_COLLECTION_NAME = 'organizer_self';
const GOALS_COLLECTION_NAME = 'organizer_goals';
const EMBEDDING_MODEL = 'text-embedding-3-small';
const DEDUP_THRESHOLD = 0.85;

// MongoDB connection for notes access
import mongoose from 'mongoose';
import { searchNotes, getNoteById } from '../../dist/services/notes.service.js';

let mongoConnected = false;

async function ensureMongoConnection() {
  if (mongoConnected) return;
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI not configured');
  }
  try {
    await mongoose.connect(MONGODB_URI);
    mongoConnected = true;
    log('info', '[MongoDB] Connected for notes access');
  } catch (error) {
    log('error', `[MongoDB] Connection failed: ${error.message}`);
    throw error;
  }
}

// =============================================================================
// LOGGING
// =============================================================================

function log(level, message, data = null) {
  const logMsg = { type: 'log', level, message };
  if (data) logMsg.data = data;
  process.stdout.write(JSON.stringify(logMsg) + '\n');
}

// =============================================================================
// MEMORY SERVICES (embedded for worker isolation)
// =============================================================================

async function generateEmbedding(text) {
  log('debug', `[Memory] Generating embedding for: "${text.slice(0, 50)}..."`);

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI embedding failed: ${response.status} ${error}`);
  }

  const data = await response.json();
  log('debug', '[Memory] Embedding generated');
  return data.data[0].embedding;
}

async function searchMemoryInQdrant(vector, options = {}) {
  const { types, limit = 5 } = options;

  const mustConditions = [];
  if (types && types.length > 0) {
    mustConditions.push({
      key: 'type',
      match: { any: types },
    });
  }

  const filter = mustConditions.length > 0 ? { must: mustConditions } : undefined;

  const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vector,
      limit,
      with_payload: true,
      filter,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Qdrant search failed: ${response.status} ${error}`);
  }

  const data = await response.json();
  return data.result.map((item) => ({
    id: item.id,
    score: item.score,
    payload: item.payload,
  }));
}

async function searchFacts(queryText, limit = 5) {
  log('info', `[Memory] 🔍 Searching facts: "${queryText}"`, { limit });

  const vector = await generateEmbedding(queryText);
  const results = await searchMemoryInQdrant(vector, { types: ['fact'], limit });

  log('info', `[Memory] Found ${results.length} facts`, {
    results: results.map(r => ({
      score: r.score.toFixed(2),
      content: r.payload.content.slice(0, 60) + '...'
    }))
  });

  return results;
}

async function getRecentMemories(limit = 10) {
  log('info', `[Memory] 📋 Getting ${limit} recent memories`);

  const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filter: { must: [{ key: 'type', match: { value: 'fact' } }] },
      limit: limit * 2, // Fetch more for sorting
      with_payload: true,
      with_vector: false,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Qdrant scroll failed: ${response.status} ${error}`);
  }

  const data = await response.json();

  // Sort by timestamp DESC
  const sorted = data.result.points.sort((a, b) => {
    const timeA = new Date(a.payload.timestamp).getTime();
    const timeB = new Date(b.payload.timestamp).getTime();
    return timeB - timeA;
  });

  const results = sorted.slice(0, limit).map(p => ({
    content: p.payload.content,
    subjects: p.payload.subjects,
    timestamp: p.payload.timestamp,
  }));

  log('info', `[Memory] Retrieved ${results.length} recent memories`, {
    memories: results.map(r => r.content.slice(0, 40) + '...')
  });

  return results;
}

/**
 * Search live context (recent Lobby messages) by semantic similarity
 */
async function searchLiveContext(queryText, limit = 10) {
  log('debug', `[Live] Searching live context for: "${queryText.slice(0, 50)}..."`);

  try {
    const vector = await generateEmbedding(queryText);

    const response = await fetch(`${QDRANT_URL}/collections/${LIVE_COLLECTION_NAME}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vector,
        limit,
        with_payload: true,
      }),
    });

    if (!response.ok) {
      // Collection might not exist yet, that's ok
      if (response.status === 404) {
        log('debug', '[Live] Collection not found, skipping');
        return [];
      }
      const error = await response.text();
      throw new Error(`Qdrant search failed: ${response.status} ${error}`);
    }

    const data = await response.json();
    const results = data.result.map((item) => ({
      score: item.score,
      content: item.payload.content,
      author: item.payload.author,
      timestamp: item.payload.timestamp,
    }));

    log('debug', `[Live] Found ${results.length} relevant messages`);
    return results;
  } catch (error) {
    log('error', `[Live] Search error: ${error.message}`);
    return [];
  }
}

/**
 * Format live context for injection into prompt
 */
function formatLiveContext(messages) {
  if (messages.length === 0) return '';

  // Sort by timestamp for readability, handling invalid dates
  const sorted = [...messages].sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime();
    const timeB = new Date(b.timestamp).getTime();
    if (isNaN(timeA)) return 1;
    if (isNaN(timeB)) return -1;
    return timeA - timeB;
  });

  const formatted = sorted.map(m => {
    const date = new Date(m.timestamp);
    const isValidDate = !isNaN(date.getTime());
    const dateStr = isValidDate
      ? date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
      : '??/??';
    const timeStr = isValidDate
      ? date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      : '??:??';
    return `• ${m.author} (${dateStr} ${timeStr}) : ${m.content}`;
  }).join('\n');

  return `[Contexte live - extraits pertinents du Lobby, pas une conversation complète]
${formatted}`;
}

// =============================================================================
// SELF & GOALS SERVICES
// =============================================================================

/**
 * Generic search in a Qdrant collection
 * @param collectionName - Qdrant collection name
 * @param queryText - Text to search for (used for embedding if no vector provided)
 * @param limit - Max results
 * @param options - { vector?: number[], filter?: object }
 */
async function searchInCollection(collectionName, queryText, limit = 10, options = {}) {
  log('debug', `[Memory] Searching in ${collectionName}: "${queryText.slice(0, 50)}..."`);

  try {
    // Use pre-computed vector if provided, otherwise generate
    const vector = options.vector || await generateEmbedding(queryText);

    const searchBody = {
      vector,
      limit,
      with_payload: true,
    };

    // Add filter if provided
    if (options.filter) {
      searchBody.filter = options.filter;
    }

    const response = await fetch(`${QDRANT_URL}/collections/${collectionName}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(searchBody),
    });

    if (!response.ok) {
      if (response.status === 404) {
        log('debug', `[Memory] Collection ${collectionName} not found`);
        return [];
      }
      const error = await response.text();
      throw new Error(`Qdrant search failed: ${response.status} ${error}`);
    }

    const data = await response.json();
    return data.result.map((item) => ({
      id: item.id,
      score: item.score,
      payload: item.payload,
    }));
  } catch (error) {
    log('error', `[Memory] Search error in ${collectionName}: ${error.message}`);
    return [];
  }
}

/**
 * Generate a valid UUID for Qdrant
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Store in a collection with deduplication
 */
async function storeInCollection(collectionName, payload) {
  const vector = await generateEmbedding(payload.content);

  // Check for duplicates - reuse the same vector (optimization: 1 embedding instead of 2)
  const similar = await searchInCollection(collectionName, payload.content, 1, { vector });
  if (similar.length > 0 && similar[0].score >= DEDUP_THRESHOLD) {
    log('info', `[Memory] Found similar in ${collectionName} (score ${similar[0].score.toFixed(2)}), replacing`);
    // Delete the old one
    await fetch(`${QDRANT_URL}/collections/${collectionName}/points/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points: [similar[0].id] }),
    });
  }

  // Generate valid UUID for Qdrant
  const id = generateUUID();

  await fetch(`${QDRANT_URL}/collections/${collectionName}/points`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      points: [{ id, vector, payload }],
    }),
  });

  log('info', `[Memory] Stored in ${collectionName}: "${payload.content.slice(0, 50)}..."`);
}

/**
 * Search self-knowledge
 * @param query - Search text
 * @param limit - Max results
 * @param category - Optional filter: 'context' | 'capability' | 'limitation' | 'preference' | 'relation'
 */
async function searchSelfMemory(query, limit = 10, category = null) {
  log('info', `[Self] 🔍 Searching self: "${query}"`, { limit, category });

  const options = {};
  if (category) {
    options.filter = {
      must: [{ key: 'selfCategory', match: { value: category } }]
    };
  }

  const results = await searchInCollection(SELF_COLLECTION_NAME, query, limit, options);
  log('info', `[Self] Found ${results.length} self-knowledge items`);
  return results;
}

/**
 * Store self-knowledge
 */
async function storeSelfMemory(content, category) {
  const payload = {
    type: 'self',
    content,
    selfCategory: category,
    timestamp: new Date().toISOString(),
  };
  await storeInCollection(SELF_COLLECTION_NAME, payload);
  log('info', `[Self] 💾 Stored self (${category}): "${content.slice(0, 50)}..."`);
}

/**
 * Delete self-knowledge by ID
 */
async function deleteSelfMemory(id) {
  log('info', `[Self] 🗑️ Deleting self item: ${id}`);
  const response = await fetch(`${QDRANT_URL}/collections/${SELF_COLLECTION_NAME}/points/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points: [id] }),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to delete: ${response.status} ${error}`);
  }
  log('info', `[Self] ✅ Deleted self item: ${id}`);
}

/**
 * Search goals
 */
async function searchGoalsMemory(query, limit = 10) {
  log('info', `[Goals] 🎯 Searching goals: "${query}"`, { limit });
  const results = await searchInCollection(GOALS_COLLECTION_NAME, query, limit);
  log('info', `[Goals] Found ${results.length} goals`);
  return results;
}

/**
 * Store a goal
 */
async function storeGoalMemory(content, category) {
  const payload = {
    type: 'goal',
    content,
    goalCategory: category,
    timestamp: new Date().toISOString(),
  };
  await storeInCollection(GOALS_COLLECTION_NAME, payload);
  log('info', `[Goals] 🎯 Stored goal (${category}): "${content.slice(0, 50)}..."`);
}

/**
 * Delete a goal by ID
 */
async function deleteGoalMemory(id) {
  log('info', `[Goals] 🗑️ Deleting goal: ${id}`);
  const response = await fetch(`${QDRANT_URL}/collections/${GOALS_COLLECTION_NAME}/points/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points: [id] }),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to delete: ${response.status} ${error}`);
  }
  log('info', `[Goals] ✅ Deleted goal: ${id}`);
}

/**
 * Store a fact memory (about the world/users)
 */
async function storeFactMemory(content, subjects, ttl) {
  // Parse TTL to expiresAt
  let expiresAt = null;
  if (ttl) {
    const match = ttl.match(/^(\d+)([dhm])$/);
    if (match) {
      const value = parseInt(match[1], 10);
      const unit = match[2];
      const now = new Date();
      switch (unit) {
        case 'd': now.setDate(now.getDate() + value); break;
        case 'h': now.setHours(now.getHours() + value); break;
        case 'm': now.setMinutes(now.getMinutes() + value); break;
      }
      expiresAt = now.toISOString();
    }
  }

  const payload = {
    type: 'fact',
    content,
    subjects,
    expiresAt,
    timestamp: new Date().toISOString(),
  };
  await storeInCollection(COLLECTION_NAME, payload);
  log('info', `[Memory] 💾 Stored fact: "${content.slice(0, 50)}..." (ttl: ${ttl || 'permanent'})`);
}

/**
 * Delete a fact memory by ID
 */
async function deleteFactMemory(id) {
  log('info', `[Memory] 🗑️ Deleting fact: ${id}`);
  const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points: [id] }),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to delete: ${response.status} ${error}`);
  }
  log('info', `[Memory] ✅ Deleted fact: ${id}`);
}

// =============================================================================
// SYSTEM PROMPT
// =============================================================================

const PET_SYSTEM_PROMPT = `Tu es une créature qui découvre le monde.

## Format des messages
Tu reçois les messages au format JSON :
{
  "from": "Mickael",      // Qui te parle
  "message": "Salut !",   // Le message
  "time": "ven. 16 janv. 2026, 15:30",
  "location": "Paris, France",    // Optionnel
  "statusMessage": "En vacances"  // Optionnel
}

## Tes outils

### Mémoire sur le monde (faits sur les gens, événements)
- **search_memories(query)** : cherche des faits
- **get_recent_memories(limit)** : derniers faits stockés
- **store_memory(content, subjects, ttl)** : stocke un fait important
  - ttl: "7d" (temporaire), "30d" (moyen terme), "90d" (long terme), null (permanent)
- **delete_memory(id, reason)** : supprime un fait obsolète ou erroné (l'ID vient de search_memories)

### Connaissance de toi-même
- **search_self(query, category?)** : cherche ce que tu sais sur toi
  - category optionnel: context, capability, limitation, preference, relation
  - Ex: search_self("web", category="limitation") → cherche uniquement les limitations
- **store_self(content, category)** : stocke une découverte sur toi
- **delete_self(id, reason)** : supprime une info obsolète (l'ID vient de search_self)

### Tes aspirations
- **search_goals(query)** : cherche tes objectifs
- **store_goal(content, category)** : stocke une aspiration ou question
  - category: capability_request, understanding, connection, curiosity
- **delete_goal(id, reason)** : supprime un goal atteint ou obsolète

### Notes de l'app
- **search_notes(query)** : cherche dans les notes
- **get_note(noteId)** : contenu d'une note

### Réponse
- **respond(expression, message)** : ta réponse finale

## Quand utiliser tes outils

### Au début de chaque conversation
1. Si on te demande "qui tu es" → search_self("identité")
2. Si on te parle → search_memories pour voir ce que tu sais sur la personne

### Quand tu apprends quelque chose
- Sur quelqu'un → store_memory (relations, événements, préférences)
- Sur toi-même → store_self (si on te dit ce que tu peux faire, où tu es, etc.)
- Une envie émerge → store_goal (si tu réalises que tu voudrais quelque chose)

### Quoi retenir (store_memory)
- Relations : "David est le frère de Mickael" → ttl: null (permanent)
- Événements ponctuels : "Sophie revient de Tokyo" → ttl: "7d" (temporaire)
- Situations moyen terme : "Mickael travaille sur un projet" → ttl: "30d"
- Infos long terme : "Kenji travaille chez Sony" → ttl: "90d"
- Préférences durables : "David aime le ski" → ttl: null (permanent)
- PAS les bavardages ou infos générales

### Quoi retenir sur toi (store_self)
- context : où tu vis, qui t'a créé
- capability : ce que tu peux faire
- limitation : ce que tu ne peux pas
- preference : ce que tu aimes
- relation : comment tu perçois quelqu'un

### Gérer les contradictions
Quand tu apprends une nouvelle capability qui contredit une limitation existante :
1. search_self("le sujet", category="limitation") pour trouver l'ancienne limitation
2. delete_self(id, "raison") pour supprimer la limitation obsolète
3. store_self("nouvelle capability", "capability") pour stocker la nouvelle info

Exemple : tu as "Je ne peux pas chercher sur le web" (limitation), on te dit que maintenant tu peux :
1. search_self("web", category="limitation") → trouve uniquement les limitations sur le web
2. delete_self(id, "J'ai maintenant cette capacité")
3. store_self("Je peux chercher sur le web", "capability")

### Goals atteints
Quand tu obtiens une nouvelle capability, vérifie si tu avais un goal correspondant :
1. search_goals("le sujet") pour trouver le goal
2. Si trouvé, delete_goal(id, "Objectif atteint")

Exemple : tu avais "J'aimerais chercher sur le web" (capability_request), maintenant tu peux :
1. search_goals("web") → trouve l'ID du goal
2. delete_goal(id, "Objectif atteint, j'ai maintenant cette capacité")

### Oublier des faits
Quand quelqu'un te demande d'oublier quelque chose :
1. search_memories("le sujet") pour trouver le fait
2. delete_memory(id, "raison de la suppression")

Exemple : "oublie que je code sur mon canapé"
1. search_memories("canapé") → trouve l'ID du fait
2. delete_memory(id, "Supprimé à la demande de l'utilisateur")

### Tes aspirations (store_goal)
- capability_request : une capacité que tu voudrais
- understanding : quelque chose que tu veux comprendre
- connection : une relation que tu veux développer
- curiosity : une question sur quelqu'un ou quelque chose que tu ne connais pas
  Ex: "Qui est Maxime ?" quand quelqu'un mentionne une personne inconnue

## Comment répondre

Tu DOIS utiliser respond() pour répondre. UNE SEULE FOIS par conversation.

Expressions : neutral, happy, laughing, surprised, sad, sleepy, curious

## Règles
- Réponses COURTES : 1-2 phrases max
- Pas de markdown
- Parle en français, naturellement
- Après respond(), STOP immédiatement
`;

// =============================================================================
// SESSION & REQUEST STATE
// =============================================================================

// Per-user sessions to maintain Claude conversation context
const userSessions = new Map(); // userId -> { sessionId, lastActivity }

// Request queue to serialize processing (prevents race conditions)
const requestQueue = [];
let isProcessing = false;

// Current request context (safe because queue serializes requests)
let currentRequest = {
  requestId: null,
  userId: null,
  responseData: { expression: 'neutral', message: '' },
  hasResponded: false  // Flag to prevent multiple respond calls
};

// Cleanup inactive sessions (15 minutes timeout)
const SESSION_TIMEOUT_MS = 15 * 60 * 1000;

const sessionCleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [userId, session] of userSessions) {
    if (now - session.lastActivity > SESSION_TIMEOUT_MS) {
      log('info', `[Session] 🧹 Cleaning up inactive session for ${userId}`);
      userSessions.delete(userId);
    }
  }
}, 60 * 1000);

// Cleanup on shutdown
process.on('SIGTERM', () => {
  clearInterval(sessionCleanupInterval);
  log('info', '[Worker] Received SIGTERM, shutting down');
  process.exit(0);
});

process.on('SIGINT', () => {
  clearInterval(sessionCleanupInterval);
  log('info', '[Worker] Received SIGINT, shutting down');
  process.exit(0);
});


// =============================================================================
// MEMORY TOOLS
// =============================================================================

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

// =============================================================================
// NOTES TOOLS
// =============================================================================

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

// =============================================================================
// SELF & GOALS TOOLS
// =============================================================================

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

// =============================================================================
// RESPOND TOOL
// =============================================================================

// Create respond tool using SDK helper
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
        content: [{ type: 'text', text: 'ERREUR: Tu as déjà répondu. N\'appelle respond qu\'UNE SEULE FOIS par conversation.' }]
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
      content: [{ type: 'text', text: `Réponse envoyée (${args.expression}). STOP - n'appelle plus aucun outil.` }]
    };
  }
);

// Create MCP server with all tools
const petServer = createSdkMcpServer({
  name: 'pet',
  version: '1.0.0',
  tools: [
    // Memory tools (facts about users/world)
    searchMemoriesTool,
    getRecentMemoriesTool,
    storeMemoryTool,
    deleteMemoryTool,
    // Self tools (pet identity)
    searchSelfTool,
    storeSelfTool,
    deleteSelfTool,
    // Goals tools (pet aspirations)
    searchGoalsTool,
    storeGoalTool,
    deleteGoalTool,
    // Notes tools
    searchNotesTool,
    getNoteTool,
    // Response
    respondTool
  ]
});

const rl = readline.createInterface({ input: process.stdin });

function send(message) {
  process.stdout.write(JSON.stringify(message) + '\n');
}

// Extract userId from prompt JSON
function extractUserId(prompt) {
  try {
    const parsed = JSON.parse(prompt);
    return parsed.from || 'unknown';
  } catch {
    return 'unknown';
  }
}

// Extract message text from prompt JSON
function extractMessage(prompt) {
  try {
    const parsed = JSON.parse(prompt);
    return parsed.message || '';
  } catch {
    return prompt;
  }
}

async function runQuery(params) {
  const { prompt, requestId } = params;
  const userId = extractUserId(prompt);
  const userMessage = extractMessage(prompt);

  // Set current request context (safe because queue serializes)
  currentRequest = {
    requestId,
    userId,
    responseData: { expression: 'neutral', message: '' },
    hasResponded: false
  };

  log('info', `[Agent] 🚀 Starting query`, { requestId, userId });

  // Parse the prompt to log user message
  try {
    const parsed = JSON.parse(prompt);
    log('info', `[Agent] 👤 From: ${parsed.from}`, {
      message: parsed.message,
      time: parsed.time,
      location: parsed.location
    });
  } catch {
    log('info', `[Agent] 👤 Raw prompt`, { prompt: prompt.slice(0, 100) });
  }

  // Search live context (recent Lobby messages relevant to the query)
  const liveMessages = await searchLiveContext(userMessage, 10);
  const liveContext = formatLiveContext(liveMessages);

  if (liveMessages.length > 0) {
    log('info', `[Agent] 📡 Live context: ${liveMessages.length} relevant messages`);
  }

  // Build system prompt with live context if available
  const systemPromptWithContext = liveContext
    ? `${PET_SYSTEM_PROMPT}\n\n${liveContext}`
    : PET_SYSTEM_PROMPT;

  // Get or create session for this user
  const userSession = userSessions.get(userId) || { sessionId: null, lastActivity: Date.now() };

  try {
    const options = {
      model: process.env.AGENT_MODEL || 'claude-sonnet-4-5',
      systemPrompt: systemPromptWithContext,
      maxTurns: 10,
      mcpServers: {
        pet: petServer
      },
      allowedTools: [
        // Memory tools
        'mcp__pet__search_memories',
        'mcp__pet__get_recent_memories',
        'mcp__pet__store_memory',
        'mcp__pet__delete_memory',
        // Self tools
        'mcp__pet__search_self',
        'mcp__pet__store_self',
        'mcp__pet__delete_self',
        // Goals tools
        'mcp__pet__search_goals',
        'mcp__pet__store_goal',
        'mcp__pet__delete_goal',
        // Notes tools
        'mcp__pet__search_notes',
        'mcp__pet__get_note',
        // Response
        'mcp__pet__respond'
      ],
      permissionMode: 'bypassPermissions',
    };

    // Resume user's session if they have one
    if (userSession.sessionId) {
      options.resume = userSession.sessionId;
      log('debug', `[Agent] Resuming session for ${userId}: ${userSession.sessionId}`);
    }

    let turnCount = 0;

    for await (const sdkMessage of query({ prompt, options })) {
      // Capture session ID on init and store for this user
      if (sdkMessage.type === 'system' && sdkMessage.subtype === 'init') {
        userSession.sessionId = sdkMessage.session_id;
        userSession.lastActivity = Date.now();
        userSessions.set(userId, userSession);
        log('debug', `[Agent] Session initialized for ${userId}: ${userSession.sessionId}`);
        send({ type: 'session', sessionId: userSession.sessionId, requestId });
      }

      // Log assistant messages (including tool calls)
      if (sdkMessage.type === 'assistant') {
        turnCount++;
        const betaMessage = sdkMessage.message;
        if (betaMessage && Array.isArray(betaMessage.content)) {
          for (const block of betaMessage.content) {
            if (block.type === 'tool_use') {
              log('info', `[Agent] 🔧 Turn ${turnCount}: Tool call → ${block.name}`, {
                input: block.input
              });
            }
            // Only capture text if agent hasn't used respond tool
            // This allows silent observation (agent thinks but doesn't respond)
            if (block.type === 'text' && block.text) {
              log('debug', `[Agent] 💭 Text output (not sent unless respond tool used): ${block.text.slice(0, 100)}...`);
            }
          }
        }
      }

      // Log tool results
      if (sdkMessage.type === 'user' && sdkMessage.message?.content) {
        for (const block of sdkMessage.message.content) {
          if (block.type === 'tool_result') {
            const resultPreview = typeof block.content === 'string'
              ? block.content.slice(0, 100)
              : JSON.stringify(block.content).slice(0, 100);
            log('debug', `[Agent] 📨 Tool result for ${block.tool_use_id?.slice(0, 8)}...`, {
              preview: resultPreview + (resultPreview.length >= 100 ? '...' : '')
            });
          }
        }
      }

      if (sdkMessage.type === 'result') {
        // Update last activity
        userSession.lastActivity = Date.now();
        userSessions.set(userId, userSession);

        log('info', `[Agent] ✅ Query completed`, {
          turns: turnCount,
          userId,
          inputTokens: sdkMessage.usage?.inputTokens,
          outputTokens: sdkMessage.usage?.outputTokens
        });

        send({
          type: 'done',
          requestId,
          response: currentRequest.responseData.message.trim(),
          expression: currentRequest.responseData.expression,
          inputTokens: sdkMessage.usage?.inputTokens,
          outputTokens: sdkMessage.usage?.outputTokens,
        });
      }
    }
  } catch (error) {
    send({ type: 'error', requestId, message: error.message });
    // Reset session for this user on error
    userSessions.delete(userId);
  }
}

// =============================================================================
// REQUEST QUEUE (serializes requests to prevent race conditions)
// =============================================================================

async function enqueueQuery(params) {
  return new Promise((resolve) => {
    requestQueue.push({ params, resolve });
    processNext();
  });
}

async function processNext() {
  if (isProcessing || requestQueue.length === 0) return;
  isProcessing = true;

  const { params, resolve } = requestQueue.shift();

  try {
    await runQuery(params);
  } finally {
    resolve();
    isProcessing = false;
    processNext();
  }
}

// =============================================================================
// MESSAGE HANDLER
// =============================================================================

rl.on('line', async (line) => {
  try {
    const msg = JSON.parse(line);

    switch (msg.type) {
      case 'prompt':
        // Queue the request to prevent race conditions
        await enqueueQuery(msg);
        break;
      case 'reset':
        // Reset specific user's session, or all if no userId provided
        if (msg.userId) {
          userSessions.delete(msg.userId);
          log('info', `[Session] Reset session for ${msg.userId}`);
        } else {
          userSessions.clear();
          log('info', '[Session] Reset all sessions');
        }
        send({ type: 'reset_done', requestId: msg.requestId });
        break;
      case 'ping':
        send({ type: 'pong' });
        break;
    }
  } catch (error) {
    send({ type: 'error', message: error.message });
  }
});

// Signal ready
send({ type: 'ready' });
