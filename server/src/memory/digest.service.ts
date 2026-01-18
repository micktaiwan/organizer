import cron, { ScheduledTask } from 'node-cron';
import { getAllLiveMessages, clearLiveCollection, getLiveCollectionInfo } from './live.service.js';
import { storeFactMemory } from './qdrant.service.js';
import { storeSelf, storeGoal } from './self.service.js';
import { getAnthropicApiKey, getDigestModel } from '../config/agent.js';
import { getConfig, setConfig } from '../models/index.js';

const DIGEST_CONFIG_KEY = 'lastDigestAt';
const DIGEST_INTERVAL_HOURS = 4;
// Run at 2h, 6h, 10h, 14h, 18h, 22h (every 4 hours)
const DIGEST_CRON_SCHEDULE = '0 2,6,10,14,18,22 * * *';

interface ExtractedFact {
  content: string;
  subjects: string[];
  ttl: string | null;
}

interface ExtractedSelf {
  content: string;
  category: 'context' | 'capability' | 'limitation' | 'preference' | 'relation';
}

interface ExtractedGoal {
  content: string;
  category: 'capability_request' | 'understanding' | 'connection';
}

interface DigestResult {
  facts: ExtractedFact[];
  self: ExtractedSelf[];
  goals: ExtractedGoal[];
}

const DIGEST_SYSTEM_PROMPT = `Tu es un assistant qui analyse les conversations du Lobby pour un petit agent nommé Eko.

## Ta tâche
Extraire 3 types d'informations :
1. **facts** : faits sur les utilisateurs (Mickael, David, etc.)
2. **self** : ce qu'Eko apprend sur lui-même (si les humains parlent de lui)
3. **goals** : aspirations qu'Eko pourrait développer (basées sur ce qu'il observe)

## 1. FACTS (sur les humains)
Ce qu'il faut extraire :
- Relations : "David est le frère de Mickael"
- Événements de vie : "Mickael s'est cassé l'épaule"
- Voyages : "David part en Grèce en février"
- Préférences : "Mickael aime le ski"
- Lieux de vie : "David habite à Ordizan"

Ce qu'il NE faut PAS extraire :
- Salutations, bavardages ("ok", "lol", "cool")
- États très temporaires ("je suis fatigué")
- Infos générales sur le monde

## 2. SELF (ce qu'Eko apprend sur lui-même)
Extraire si les humains :
- Parlent d'Eko directement : "Eko peut maintenant répondre dans les salons" → capability
- Lui expliquent où il vit : "Tu es dans l'app Organizer" → context
- Lui donnent des limites : "Tu ne peux pas encore créer de notes" → limitation
- Expriment une relation : "Eko, tu es notre assistant préféré" → relation

Categories: context, capability, limitation, preference, relation

## 3. GOALS (aspirations émergentes)
Déduire des aspirations si :
- Un sujet revient souvent qu'Eko ne peut pas traiter → capability_request
  Ex: Ils parlent beaucoup de recherches web → "J'aimerais pouvoir chercher sur le web"
- Un sujet complexe qu'Eko pourrait vouloir comprendre → understanding
  Ex: Discussions techniques récurrentes → "Je veux mieux comprendre leur travail"
- Une relation à développer → connection
  Ex: Un humain interagit peu avec Eko → "J'aimerais que X me parle plus"

IMPORTANT : Les goals doivent être SUBTILS et ÉMERGENTS, pas une liste de souhaits évidente.
Ne génère un goal QUE si c'est vraiment pertinent basé sur la conversation.

Categories: capability_request, understanding, connection

## Format de sortie
{
  "facts": [
    { "content": "...", "subjects": ["personne", "sujet"], "ttl": null }
  ],
  "self": [
    { "content": "...", "category": "capability" }
  ],
  "goals": [
    { "content": "...", "category": "understanding" }
  ]
}

- ttl : null pour permanent, "7d" pour temporaire
- Si rien à extraire pour une catégorie, retourne un tableau vide []
`;

/**
 * Run the digest process: extract facts from live messages and store them
 */
export async function runDigest(): Promise<{ factsExtracted: number; messagesProcessed: number }> {
  const startTime = Date.now();
  console.log('[Digest] Starting digest process...');

  // Get collection info
  const info = await getLiveCollectionInfo();
  if (info.pointsCount === 0) {
    console.log('[Digest] No messages in live collection, skipping');
    return { factsExtracted: 0, messagesProcessed: 0 };
  }

  // Get all live messages
  const messages = await getAllLiveMessages();
  console.log(`[Digest] Processing ${messages.length} messages...`);

  if (messages.length === 0) {
    return { factsExtracted: 0, messagesProcessed: 0 };
  }

  // Format messages for LLM
  const formattedMessages = messages
    .map((m) => {
      const date = new Date(m.timestamp);
      const dateStr = date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
      const timeStr = date.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      });
      return `[${dateStr} ${timeStr}] ${m.author}: ${m.content}`;
    })
    .join('\n');

  // Call LLM to extract facts, self, and goals
  let facts: ExtractedFact[] = [];
  let selfItems: ExtractedSelf[] = [];
  let goalItems: ExtractedGoal[] = [];

  let apiKey: string;
  try {
    apiKey = getAnthropicApiKey();
  } catch {
    console.error('[Digest] Anthropic API key not configured, skipping');
    return { factsExtracted: 0, messagesProcessed: messages.length };
  }

  // Log prompt stats
  const userMessage = `Voici les messages du Lobby à analyser :\n\n${formattedMessages}`;
  const totalChars = DIGEST_SYSTEM_PROMPT.length + userMessage.length;
  const estimatedTokens = Math.ceil(totalChars / 4); // ~4 chars per token for French
  console.log(`[Digest] Prompt: ${totalChars} chars (~${estimatedTokens} tokens)`);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: getDigestModel(),
        max_tokens: 2048,
        system: DIGEST_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: userMessage,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API failed: ${response.status} ${error}`);
    }

    const data = await response.json() as { content: Array<{ type: string; text?: string }> };

    // Parse the response
    const textContent = data.content.find((c: { type: string }) => c.type === 'text');
    if (textContent && textContent.type === 'text' && textContent.text) {
      // Extract JSON from the response (handle markdown code blocks)
      let jsonStr = textContent.text;
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      const parsed = JSON.parse(jsonStr.trim()) as DigestResult;

      // Validate and extract facts
      if (Array.isArray(parsed.facts)) {
        facts = parsed.facts.filter(
          (f: unknown): f is ExtractedFact =>
            typeof f === 'object' &&
            f !== null &&
            typeof (f as ExtractedFact).content === 'string' &&
            Array.isArray((f as ExtractedFact).subjects)
        );
      }

      // Validate and extract self
      if (Array.isArray(parsed.self)) {
        const validCategories = ['context', 'capability', 'limitation', 'preference', 'relation'];
        selfItems = parsed.self.filter(
          (s: unknown): s is ExtractedSelf =>
            typeof s === 'object' &&
            s !== null &&
            typeof (s as ExtractedSelf).content === 'string' &&
            validCategories.includes((s as ExtractedSelf).category)
        );
      }

      // Validate and extract goals
      if (Array.isArray(parsed.goals)) {
        const validCategories = ['capability_request', 'understanding', 'connection'];
        goalItems = parsed.goals.filter(
          (g: unknown): g is ExtractedGoal =>
            typeof g === 'object' &&
            g !== null &&
            typeof (g as ExtractedGoal).content === 'string' &&
            validCategories.includes((g as ExtractedGoal).category)
        );
      }
    }
  } catch (error) {
    console.error('[Digest] LLM extraction failed:', error);
    return { factsExtracted: 0, messagesProcessed: messages.length };
  }

  console.log(`[Digest] Extracted: ${facts.length} facts, ${selfItems.length} self, ${goalItems.length} goals`);

  // Store each item
  let storeFailures = 0;

  // Store facts
  for (const fact of facts) {
    try {
      await storeFactMemory({
        content: fact.content,
        subjects: fact.subjects,
        ttl: fact.ttl,
      });
      console.log(`[Digest] Stored fact: "${fact.content.slice(0, 50)}..."`);
    } catch (error) {
      storeFailures++;
      console.error(`[Digest] Failed to store fact: ${error}`);
    }
  }

  // Store self
  for (const self of selfItems) {
    try {
      await storeSelf({
        content: self.content,
        category: self.category,
      });
      console.log(`[Digest] Stored self [${self.category}]: "${self.content.slice(0, 50)}..."`);
    } catch (error) {
      storeFailures++;
      console.error(`[Digest] Failed to store self: ${error}`);
    }
  }

  // Store goals
  for (const goal of goalItems) {
    try {
      await storeGoal({
        content: goal.content,
        category: goal.category,
      });
      console.log(`[Digest] Stored goal [${goal.category}]: "${goal.content.slice(0, 50)}..."`);
    } catch (error) {
      storeFailures++;
      console.error(`[Digest] Failed to store goal: ${error}`);
    }
  }

  const totalItems = facts.length + selfItems.length + goalItems.length;

  // Clear the live collection only if all items were stored
  if (storeFailures > 0) {
    console.error(`[Digest] Skipping clear - ${storeFailures}/${totalItems} items failed to store`);
    return { factsExtracted: totalItems - storeFailures, messagesProcessed: messages.length };
  }

  const cleared = await clearLiveCollection();
  console.log(`[Digest] Cleared ${cleared} messages from live collection`);

  // Save last digest timestamp
  await setConfig(DIGEST_CONFIG_KEY, new Date().toISOString());

  const duration = Date.now() - startTime;
  console.log(`[Digest] Completed in ${duration}ms: ${facts.length} facts, ${selfItems.length} self, ${goalItems.length} goals from ${messages.length} messages`);

  return { factsExtracted: totalItems, messagesProcessed: messages.length };
}

/**
 * Check if catch-up digest is needed (last digest > 4h ago)
 */
async function checkAndRunCatchUp(): Promise<void> {
  const lastDigestStr = await getConfig<string>(DIGEST_CONFIG_KEY);

  if (!lastDigestStr) {
    console.log('[Digest] No previous digest found, running catch-up...');
    await runDigest();
    return;
  }

  const lastDigest = new Date(lastDigestStr);
  const hoursSinceLastDigest = (Date.now() - lastDigest.getTime()) / (1000 * 60 * 60);

  if (hoursSinceLastDigest >= DIGEST_INTERVAL_HOURS) {
    console.log(`[Digest] Last digest was ${hoursSinceLastDigest.toFixed(1)}h ago, running catch-up...`);
    await runDigest();
  } else {
    console.log(`[Digest] Last digest was ${hoursSinceLastDigest.toFixed(1)}h ago, no catch-up needed`);
  }
}

/**
 * Schedule the digest with fixed hours + startup catch-up
 * Runs at 2h, 6h, 10h, 14h, 18h, 22h (every 4 hours)
 */
export async function scheduleDigest(): Promise<ScheduledTask> {
  console.log(`[Digest] Scheduling at fixed hours: ${DIGEST_CRON_SCHEDULE}`);

  // Check for catch-up on startup
  try {
    await checkAndRunCatchUp();
  } catch (error) {
    console.error('[Digest] Catch-up check failed:', error);
  }

  // Schedule cron job for fixed hours
  const task = cron.schedule(DIGEST_CRON_SCHEDULE, async () => {
    console.log(`[Digest] Cron triggered at ${new Date().toISOString()}`);
    try {
      await runDigest();
    } catch (error) {
      console.error('[Digest] Scheduled digest failed:', error);
    }
  }, {
    timezone: 'Europe/Paris'
  });

  return task;
}
