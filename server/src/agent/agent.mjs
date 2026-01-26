// Main agent query logic
import { query, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { log } from './logger.mjs';
import { PET_SYSTEM_PROMPT } from './prompt.mjs';
import { userSessions } from './session.mjs';
import { searchLiveContext, formatLiveContext } from './memory/live.mjs';
import { respondTool, setRequestContext } from './tools/respond-tool.mjs';

// Local MCP server with only the respond tool (needs access to worker state)
const localServer = createSdkMcpServer({
  name: 'local',
  version: '1.0.0',
  tools: [respondTool]
});

// MCP HTTP config for Organizer
const MCP_URL = process.env.MCP_URL || 'http://localhost:3001/mcp';
const EKO_MCP_TOKEN = process.env.EKO_MCP_TOKEN;

// Debug: log MCP config at startup
log('info', `[Agent] MCP config: URL=${MCP_URL}, token=${EKO_MCP_TOKEN ? 'SET (' + EKO_MCP_TOKEN.substring(0, 12) + '...)' : 'NOT SET'}`);

// Current request context (set per request)
let currentRequest = {
  requestId: null,
  userId: null,
  responseData: { expression: 'neutral', message: '' },
  hasResponded: false
};

// Send function (will be set from worker)
let sendFn = null;

export function setSendFunction(fn) {
  sendFn = fn;
}

function send(message) {
  if (sendFn) sendFn(message);
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

// Extract user message from prompt
function extractMessage(prompt) {
  // Try JSON format first
  try {
    const parsed = JSON.parse(prompt);
    return parsed.message || '';
  } catch {
    // Extract from "Dernier message de X (depuis Y): <message>"
    const match = prompt.match(/Dernier message de .+?: (.+?)(?:\n\nIMPORTANT|$)/s);
    if (match && match[1]) {
      return match[1].trim();
    }
    return '';  // Don't return full prompt for embedding search
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

  // Update respond tool context with the new request
  setRequestContext(currentRequest, send);

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
    // Build MCP servers config
    const mcpServers = {
      local: localServer  // Local server for respond tool
    };

    // Add HTTP MCP if token is configured
    if (EKO_MCP_TOKEN) {
      mcpServers.organizer = {
        type: 'http',
        url: MCP_URL,
        headers: {
          'Authorization': `Bearer ${EKO_MCP_TOKEN}`
        }
      };
    } else {
      log('warn', '[Agent] EKO_MCP_TOKEN not set, Eko will have limited tools');
    }

    const options = {
      model: process.env.AGENT_MODEL || 'claude-sonnet-4-5',
      systemPrompt: systemPromptWithContext,
      maxTurns: 10,
      mcpServers,
      allowedTools: [
        // Response (local)
        'mcp__local__respond',
        // Memory tools (HTTP MCP)
        'mcp__organizer__search_memories',
        'mcp__organizer__get_recent_memories',
        'mcp__organizer__store_memory',
        'mcp__organizer__delete_memory',
        // Self tools
        'mcp__organizer__search_self',
        'mcp__organizer__store_self',
        'mcp__organizer__delete_self',
        // Goals tools
        'mcp__organizer__search_goals',
        'mcp__organizer__store_goal',
        'mcp__organizer__delete_goal',
        // Notes tools
        'mcp__organizer__list_notes',
        'mcp__organizer__search_notes',
        'mcp__organizer__get_note',
        'mcp__organizer__create_note',
        'mcp__organizer__update_note',
        // Messages tools
        'mcp__organizer__list_rooms',
        'mcp__organizer__list_messages',
        'mcp__organizer__send_message',
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

export { runQuery };
