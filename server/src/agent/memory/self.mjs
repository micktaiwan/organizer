// Self-knowledge memory operations
import { QDRANT_URL, SELF_COLLECTION_NAME } from '../config.mjs';
import { log } from '../logger.mjs';
import { searchInCollection, storeInCollection } from './qdrant.mjs';

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

export { searchSelfMemory, storeSelfMemory, deleteSelfMemory };
