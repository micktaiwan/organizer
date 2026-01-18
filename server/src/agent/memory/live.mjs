// Live context (recent Lobby messages)
import { QDRANT_URL, LIVE_COLLECTION_NAME } from '../config.mjs';
import { log } from '../logger.mjs';
import { generateEmbedding } from './embedding.mjs';

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

export { searchLiveContext, formatLiveContext };
