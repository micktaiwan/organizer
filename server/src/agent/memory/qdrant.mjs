// Qdrant vector database operations
import { QDRANT_URL, COLLECTION_NAME, DEDUP_THRESHOLD } from '../config.mjs';
import { log } from '../logger.mjs';
import { generateEmbedding } from './embedding.mjs';

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

export { searchMemoryInQdrant, searchInCollection, storeInCollection, generateUUID };
