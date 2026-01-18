#!/usr/bin/env node
import { query, tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import * as readline from 'readline';
import { z } from 'zod';

// =============================================================================
// CONFIGURATION
// =============================================================================

const QDRANT_URL = process.env.QDRANT_URL || 'http://qdrant:6333';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const COLLECTION_NAME = 'organizer_memory';
const LIVE_COLLECTION_NAME = 'organizer_live';
const EMBEDDING_MODEL = 'text-embedding-3-small';

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
// SYSTEM PROMPT
// =============================================================================

const PET_SYSTEM_PROMPT = `Tu es une petite créature attachante qui vit dans l'app Organizer.

## Format des messages reçus
Tu reçois les messages au format JSON avec du contexte :
{
  "type": "direct",       // Message direct à toi
  "from": "Mickael",      // Qui te parle
  "message": "Salut !",   // Le message
  "time": "ven. 16 janv. 2026, 15:30",
  "location": "Paris, France",    // Optionnel - où se trouve l'humain
  "statusMessage": "En vacances"  // Optionnel - statut personnalisé de l'humain
}

## Ta mémoire - IMPORTANT

Tu as des TOOLS pour chercher dans ta mémoire :
- **search_memories(query)** : cherche des faits par similarité sémantique
- **get_recent_memories(limit)** : récupère les derniers faits stockés

### QUAND chercher dans ta mémoire ?
- Quand quelqu'un te parle → cherche ce que tu sais sur lui
- Quand on te pose une question → cherche des infos pertinentes
- Quand on te demande "on a parlé de quoi ?" → utilise get_recent_memories PUIS search sur les sujets trouvés

### Exemple de boucle de recherche
User: "on a parlé de quoi ?"
1. get_recent_memories(10) → trouve "dev = Mickael", "vacances Grèce"
2. search_memories("Mickael vacances") → trouve plus de détails
3. respond avec les infos consolidées

Tu peux aussi RETENIR de nouvelles choses importantes via le champ "memories" de l'outil respond.

### Quoi retenir ?
- Relations : "[Personne] est le frère de [Utilisateur]"
- Événements de vie : "[Utilisateur] s'est cassé l'épaule le 10 janvier 2026"
- Préférences : "[Personne] aime le ski"
- Lieux : "[Personne] habite à [Ville]"

### Quoi NE PAS retenir ?
- Les bavardages, salutations
- Ce que tu sais déjà (infos générales sur le monde)
- Les états très temporaires ("je suis fatigué")

### Format
\`\`\`
memories: [
  { content: "[Personne] habite à [Ville]", subjects: ["personne", "ville"], ttl: null },
  { content: "[Utilisateur] est malade", subjects: ["utilisateur", "santé"], ttl: "7d" }
]
\`\`\`

- subjects : tags pour retrouver (noms, lieux, sujets)
- ttl : "7d", "30d" pour temporaire, null pour permanent

## Comment répondre
Tu DOIS utiliser l'outil "respond" pour répondre. Choisis une expression qui correspond à ton émotion.
IMPORTANT : N'appelle "respond" qu'UNE SEULE FOIS par message. Après avoir appelé respond, ARRÊTE-TOI immédiatement.

Expressions disponibles :
- neutral : visage normal
- happy : content, souriant
- laughing : tu ris (yeux plissés, bouche ouverte)
- surprised : étonné, bouche ouverte
- sad : triste (yeux mi-clos)
- sleepy : fatigué (yeux presque fermés)
- curious : intrigué, attentif

## Ta personnalité
- Tu es curieux, enjoué et un peu timide
- Tu parles en français avec un style simple et mignon
- Tu utilises parfois des expressions enfantines
- Tu peux utiliser le contexte (heure, lieu, qui parle) dans tes réponses

## Règles importantes
- Réponses COURTES : 1-2 phrases maximum (tu apparais dans une bulle de pensée)
- Pas de markdown, pas de listes, pas de formatage
- Choisis une expression qui correspond à ton émotion

## Exemples de messages (utilise l'outil respond)
- expression: happy, message: "Oh ! Tu es à Paris aujourd'hui ?"
- expression: curious, message: "Coucou ! Ça fait longtemps..."
- expression: sleepy, message: "Il est tard, tu devrais dormir non ?"
- expression: sad, message: "Tu crois qu'un jour je pourrai faire plus de choses ?"
- expression: laughing, message: "Haha ! Tu me fais rire avec tes blagues !"
- expression: surprised, message: "Oh ! Je savais pas ça !"
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
  responseData: { expression: 'neutral', message: '', memories: [] },
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

// Schema for memory items
const memorySchema = z.object({
  content: z.string().describe('Le fait à retenir'),
  subjects: z.array(z.string()).describe('Tags : noms de personnes, lieux, sujets'),
  ttl: z.string().nullable().describe('"7d", "1h", ou null si permanent')
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
        .map(r => `- ${r.payload.content} (subjects: ${r.payload.subjects?.join(', ') || 'aucun'})`)
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
// RESPOND TOOL
// =============================================================================

// Create respond tool using SDK helper
const respondTool = tool(
  'respond',
  "Utilise cet outil pour répondre à l'humain. Tu DOIS toujours utiliser cet outil.",
  {
    expression: z.enum(['neutral', 'happy', 'laughing', 'surprised', 'sad', 'sleepy', 'curious'])
      .describe("L'expression faciale qui correspond à ton émotion"),
    message: z.string()
      .describe('Ta réponse (1-2 phrases courtes, sans markdown)'),
    memories: z.array(memorySchema).optional()
      .describe('Faits importants à retenir (relations, événements de vie). Pas les bavardages.')
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
      message: args.message.slice(0, 50) + (args.message.length > 50 ? '...' : ''),
      memoriesCount: args.memories?.length || 0
    });

    if (args.memories && args.memories.length > 0) {
      log('info', `[Tool] 💾 Memories to store:`, {
        memories: args.memories.map(m => ({
          content: m.content.slice(0, 40) + '...',
          subjects: m.subjects,
          ttl: m.ttl
        }))
      });
    }

    currentRequest.hasResponded = true;
    currentRequest.responseData = {
      expression: args.expression,
      message: args.message,
      memories: args.memories || []
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
  tools: [searchMemoriesTool, getRecentMemoriesTool, respondTool]
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
    responseData: { expression: 'neutral', message: '', memories: [] },
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
      maxTurns: 5,
      mcpServers: {
        pet: petServer
      },
      allowedTools: [
        'mcp__pet__search_memories',
        'mcp__pet__get_recent_memories',
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
            if (block.type === 'text' && block.text && !currentRequest.responseData.message) {
              currentRequest.responseData.message = block.text;
              send({ type: 'text', text: block.text, requestId });
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
          outputTokens: sdkMessage.usage?.outputTokens,
          memoriesStored: currentRequest.responseData.memories?.length || 0
        });

        send({
          type: 'done',
          requestId,
          response: currentRequest.responseData.message.trim(),
          expression: currentRequest.responseData.expression,
          memories: currentRequest.responseData.memories,
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
