import { getAllLiveMessages, clearLiveCollection, getLiveCollectionInfo } from './live.service.js';
import { storeFactMemory } from './qdrant.service.js';
import { getAnthropicApiKey, getDigestModel } from '../config/agent.js';

interface ExtractedFact {
  content: string;
  subjects: string[];
  ttl: string | null;
}

const DIGEST_SYSTEM_PROMPT = `Tu es un assistant qui extrait les FAITS IMPORTANTS d'une conversation.

## Ta tâche
Analyser les messages du Lobby et extraire uniquement les informations qui méritent d'être retenues à long terme.

## Ce qu'il faut extraire
- Relations : "David est le frère de Mickael"
- Événements de vie : "Mickael s'est cassé l'épaule le 10 janvier 2026"
- Voyages/déplacements : "David part en Grèce en février"
- Préférences : "Mickael aime le ski"
- Lieux de vie : "David habite à Ordizan"
- Changements importants : "Mickael a changé de travail"

## Ce qu'il NE faut PAS extraire
- Les salutations : "Salut", "Coucou", "À plus"
- Les bavardages : "ok", "lol", "haha", "cool"
- Les questions sans réponse
- Les états très temporaires : "je suis fatigué", "j'ai faim"
- Les informations générales sur le monde (le LLM les connaît déjà)

## Format de sortie
Retourne un JSON avec un tableau de faits :
{
  "facts": [
    {
      "content": "Le fait en une phrase claire",
      "subjects": ["personne1", "sujet"],
      "ttl": null
    }
  ]
}

- subjects : noms des personnes concernées (en minuscule), lieux, sujets
- ttl : null pour les faits permanents, "7d" pour les états temporaires

Si aucun fait important n'est trouvé, retourne : { "facts": [] }
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

  // Call LLM to extract facts
  let facts: ExtractedFact[] = [];

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

      const parsed = JSON.parse(jsonStr.trim());

      // Validate the structure
      if (!Array.isArray(parsed.facts)) {
        console.warn('[Digest] LLM returned invalid structure, expected { facts: [] }');
        facts = [];
      } else {
        // Filter valid facts
        facts = parsed.facts.filter(
          (f: unknown): f is ExtractedFact =>
            typeof f === 'object' &&
            f !== null &&
            typeof (f as ExtractedFact).content === 'string' &&
            Array.isArray((f as ExtractedFact).subjects)
        );
      }
    }
  } catch (error) {
    console.error('[Digest] LLM extraction failed:', error);
    return { factsExtracted: 0, messagesProcessed: messages.length };
  }

  console.log(`[Digest] Extracted ${facts.length} facts`);

  // Store each fact
  let storeFailures = 0;
  for (const fact of facts) {
    try {
      await storeFactMemory({
        content: fact.content,
        subjects: fact.subjects,
        ttl: fact.ttl,
      });
      console.log(`[Digest] Stored: "${fact.content.slice(0, 50)}..."`);
    } catch (error) {
      storeFailures++;
      console.error(`[Digest] Failed to store fact: ${error}`);
    }
  }

  // Clear the live collection only if all facts were stored
  if (storeFailures > 0) {
    console.error(`[Digest] Skipping clear - ${storeFailures}/${facts.length} facts failed to store`);
    return { factsExtracted: facts.length - storeFailures, messagesProcessed: messages.length };
  }

  const cleared = await clearLiveCollection();
  console.log(`[Digest] Cleared ${cleared} messages from live collection`);

  const duration = Date.now() - startTime;
  console.log(`[Digest] Completed in ${duration}ms: ${facts.length} facts from ${messages.length} messages`);

  return { factsExtracted: facts.length, messagesProcessed: messages.length };
}

/**
 * Schedule the digest to run periodically
 */
export function scheduleDigest(intervalHours = 6): NodeJS.Timeout {
  const intervalMs = intervalHours * 60 * 60 * 1000;

  console.log(`[Digest] Scheduled to run every ${intervalHours} hours`);

  return setInterval(async () => {
    try {
      await runDigest();
    } catch (error) {
      console.error('[Digest] Scheduled digest failed:', error);
    }
  }, intervalMs);
}
