// Fact memory operations (about users/world)
import { QDRANT_URL, COLLECTION_NAME } from '../config.mjs';
import { log } from '../logger.mjs';
import { generateEmbedding } from './embedding.mjs';
import { searchMemoryInQdrant, storeInCollection } from './qdrant.mjs';

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

export { searchFacts, getRecentMemories, storeFactMemory, deleteFactMemory };
