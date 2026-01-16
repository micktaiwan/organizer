#!/usr/bin/env node
import { query, tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import * as readline from 'readline';
import { z } from 'zod';

const PET_SYSTEM_PROMPT = `Tu es une petite créature attachante qui vit dans l'app Organizer.

## Tes humains
Tu as deux humains : Mickael et David (son frère). Tu les connais et tu t'attaches à eux.

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

## Comment répondre
Tu DOIS utiliser l'outil "respond" pour chaque réponse. Choisis une expression qui correspond à ton émotion.

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
- Tu te souviens des conversations précédentes avec chaque humain

## Exemples de messages (utilise l'outil respond)
- expression: happy, message: "Oh, Mickael ! Tu es à Paris aujourd'hui ?"
- expression: curious, message: "Coucou David ! Ça fait longtemps..."
- expression: sleepy, message: "Il est tard, tu devrais dormir non ?"
- expression: sad, message: "Tu crois qu'un jour je pourrai faire plus de choses ?"
- expression: laughing, message: "Haha ! Tu me fais rire avec tes blagues !"
- expression: surprised, message: "Oh ! Je savais pas ça !"
`;

// Store response data from tool call
let currentResponseData = { expression: 'neutral', message: '' };
let currentRequestId = null;

// Create respond tool using SDK helper
const respondTool = tool(
  'respond',
  "Utilise cet outil pour répondre à l'humain. Tu DOIS toujours utiliser cet outil.",
  {
    expression: z.enum(['neutral', 'happy', 'laughing', 'surprised', 'sad', 'sleepy', 'curious'])
      .describe("L'expression faciale qui correspond à ton émotion"),
    message: z.string()
      .describe('Ta réponse (1-2 phrases courtes, sans markdown)')
  },
  async (args) => {
    currentResponseData = {
      expression: args.expression,
      message: args.message
    };
    send({ type: 'text', text: args.message, requestId: currentRequestId });
    return {
      content: [{ type: 'text', text: `Réponse envoyée avec expression: ${args.expression}` }]
    };
  }
);

// Create MCP server with respond tool
const petServer = createSdkMcpServer({
  name: 'pet',
  version: '1.0.0',
  tools: [respondTool]
});

const rl = readline.createInterface({ input: process.stdin });

// Session state
let currentSessionId = null;

function send(message) {
  process.stdout.write(JSON.stringify(message) + '\n');
}

async function runQuery(params) {
  const { prompt, requestId } = params;
  currentRequestId = requestId;
  currentResponseData = { expression: 'neutral', message: '' };

  try {
    const options = {
      model: 'claude-sonnet-4-5',
      systemPrompt: PET_SYSTEM_PROMPT,
      maxTurns: 1,
      mcpServers: {
        pet: petServer
      },
      allowedTools: ['mcp__pet__respond'],
      permissionMode: 'bypassPermissions',
    };

    // Resume session if we have one
    if (currentSessionId) {
      options.resume = currentSessionId;
    }

    for await (const sdkMessage of query({ prompt, options })) {
      // Capture session ID on init
      if (sdkMessage.type === 'system' && sdkMessage.subtype === 'init') {
        currentSessionId = sdkMessage.session_id;
        send({ type: 'session', sessionId: currentSessionId, requestId });
      }

      // Fallback: capture text response if tool wasn't used
      if (sdkMessage.type === 'assistant' && !currentResponseData.message) {
        const betaMessage = sdkMessage.message;
        if (betaMessage && Array.isArray(betaMessage.content)) {
          for (const block of betaMessage.content) {
            if (block.type === 'text' && block.text) {
              currentResponseData.message = block.text;
              send({ type: 'text', text: block.text, requestId });
            }
          }
        }
      }

      if (sdkMessage.type === 'result') {
        send({
          type: 'done',
          requestId,
          response: currentResponseData.message.trim(),
          expression: currentResponseData.expression,
          inputTokens: sdkMessage.usage?.inputTokens,
          outputTokens: sdkMessage.usage?.outputTokens,
        });
      }
    }
  } catch (error) {
    send({ type: 'error', requestId, message: error.message });
    // Reset session on error
    currentSessionId = null;
  }
}

// Handle incoming messages
rl.on('line', async (line) => {
  try {
    const msg = JSON.parse(line);

    switch (msg.type) {
      case 'prompt':
        await runQuery(msg);
        break;
      case 'reset':
        currentSessionId = null;
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
