// Goals memory operations
import { QDRANT_URL, GOALS_COLLECTION_NAME } from '../config.mjs';
import { log } from '../logger.mjs';
import { searchInCollection, storeInCollection } from './qdrant.mjs';

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

export { searchGoalsMemory, storeGoalMemory, deleteGoalMemory };
