import { createHash } from 'crypto';
import { generateEmbedding } from './embedding.service.js';
import { qdrantRequest } from './qdrant.service.js';
import type { MemoryPayload, MemorySearchResult, SelfMemoryInput, GoalMemoryInput } from './types.js';

const SELF_COLLECTION = 'organizer_self';
const GOALS_COLLECTION = 'organizer_goals';
const DEDUP_THRESHOLD = 0.85;

// ============================================================================
// Collection Setup (call once at startup or via script)
// ============================================================================

export async function ensureSelfCollections(): Promise<void> {
  const collections = [SELF_COLLECTION, GOALS_COLLECTION];

  for (const collection of collections) {
    try {
      await qdrantRequest(`/collections/${collection}`);
      console.log(`[Self] Collection ${collection} exists`);
    } catch {
      // Collection doesn't exist, create it
      await qdrantRequest(`/collections/${collection}`, {
        method: 'PUT',
        body: JSON.stringify({
          vectors: {
            size: 1536, // OpenAI text-embedding-3-small
            distance: 'Cosine',
          },
        }),
      });
      console.log(`[Self] Created collection ${collection}`);
    }
  }
}

// ============================================================================
// Helpers
// ============================================================================

function generateId(content: string, type: string): string {
  const uniqueStr = `${type}_${content}_${Date.now()}`;
  const hash = createHash('md5').update(uniqueStr).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

async function searchInCollection(
  collection: string,
  query: string,
  limit = 10
): Promise<MemorySearchResult[]> {
  const vector = await generateEmbedding(query);

  const response = await qdrantRequest<{
    result: { id: string; score: number; payload: MemoryPayload }[];
  }>(`/collections/${collection}/points/search`, {
    method: 'POST',
    body: JSON.stringify({
      vector,
      limit,
      with_payload: true,
    }),
  });

  return response.result.map((item) => ({
    id: item.id,
    score: item.score,
    payload: item.payload,
  }));
}

async function storeInCollection(
  collection: string,
  payload: MemoryPayload
): Promise<void> {
  const vector = await generateEmbedding(payload.content);

  // Check for duplicates
  const similar = await searchInCollection(collection, payload.content, 1);
  if (similar.length > 0 && similar[0].score >= DEDUP_THRESHOLD) {
    console.log(
      `[Self] Found similar in ${collection} (score ${similar[0].score.toFixed(2)}): "${similar[0].payload.content.slice(0, 50)}..."`
    );
    // Delete the old one
    await qdrantRequest(`/collections/${collection}/points/delete`, {
      method: 'POST',
      body: JSON.stringify({ points: [similar[0].id] }),
    });
  }

  const id = generateId(payload.content, payload.type);

  await qdrantRequest(`/collections/${collection}/points`, {
    method: 'PUT',
    body: JSON.stringify({
      points: [{ id, vector, payload }],
    }),
  });

  console.log(`[Self] Stored in ${collection}: "${payload.content.slice(0, 50)}..."`);
}

async function deleteFromCollection(collection: string, id: string): Promise<void> {
  await qdrantRequest(`/collections/${collection}/points/delete`, {
    method: 'POST',
    body: JSON.stringify({ points: [id] }),
  });
  console.log(`[Self] Deleted from ${collection}: ${id}`);
}

// ============================================================================
// Counts (exact totals from Qdrant)
// ============================================================================

export async function countSelf(): Promise<number> {
  try {
    const result = await qdrantRequest<{ result: { points_count: number } }>(
      `/collections/${SELF_COLLECTION}`
    );
    return result.result.points_count;
  } catch {
    return 0;
  }
}

export async function countGoals(): Promise<number> {
  try {
    const result = await qdrantRequest<{ result: { points_count: number } }>(
      `/collections/${GOALS_COLLECTION}`
    );
    return result.result.points_count;
  } catch {
    return 0;
  }
}

// ============================================================================
// Self (Identity)
// ============================================================================

/**
 * Search what the pet knows about itself
 */
export async function searchSelf(query: string, limit = 10): Promise<MemorySearchResult[]> {
  console.log(`[Self] 🔍 Searching self: "${query}"`);
  return searchInCollection(SELF_COLLECTION, query, limit);
}

/**
 * Store something the pet learned about itself
 */
export async function storeSelf(input: SelfMemoryInput): Promise<void> {
  const payload: MemoryPayload = {
    type: 'self',
    content: input.content,
    selfCategory: input.category,
    timestamp: new Date().toISOString(),
  };

  await storeInCollection(SELF_COLLECTION, payload);
  console.log(`[Self] 💾 Stored self (${input.category}): "${input.content.slice(0, 50)}..."`);
}

/**
 * Get all self knowledge (for bootstrap/debug)
 */
export async function listSelf(limit = 50): Promise<MemoryPayload[]> {
  const response = await qdrantRequest<{
    result: { points: { payload: MemoryPayload }[] };
  }>(`/collections/${SELF_COLLECTION}/points/scroll`, {
    method: 'POST',
    body: JSON.stringify({
      limit,
      with_payload: true,
      with_vector: false,
    }),
  });

  return response.result.points.map((p) => p.payload);
}

/**
 * Get all self knowledge with IDs (for brain dashboard)
 */
export async function listSelfWithIds(limit = 50): Promise<{ id: string; payload: MemoryPayload }[]> {
  const response = await qdrantRequest<{
    result: { points: { id: string; payload: MemoryPayload }[] };
  }>(`/collections/${SELF_COLLECTION}/points/scroll`, {
    method: 'POST',
    body: JSON.stringify({
      limit,
      with_payload: true,
      with_vector: false,
    }),
  });

  return response.result.points.map((p) => ({ id: p.id, payload: p.payload }));
}

/**
 * Delete a self memory
 */
export async function deleteSelf(id: string): Promise<void> {
  await deleteFromCollection(SELF_COLLECTION, id);
}

// ============================================================================
// Goals (Aspirations)
// ============================================================================

/**
 * Search the pet's goals and aspirations
 */
export async function searchGoals(query: string, limit = 10): Promise<MemorySearchResult[]> {
  console.log(`[Self] 🎯 Searching goals: "${query}"`);
  return searchInCollection(GOALS_COLLECTION, query, limit);
}

/**
 * Store a new goal or aspiration
 */
export async function storeGoal(input: GoalMemoryInput): Promise<void> {
  const payload: MemoryPayload = {
    type: 'goal',
    content: input.content,
    goalCategory: input.category,
    timestamp: new Date().toISOString(),
  };

  await storeInCollection(GOALS_COLLECTION, payload);
  console.log(`[Self] 🎯 Stored goal (${input.category}): "${input.content.slice(0, 50)}..."`);
}

/**
 * Get all goals (for bootstrap/debug)
 */
export async function listGoals(limit = 50): Promise<MemoryPayload[]> {
  const response = await qdrantRequest<{
    result: { points: { payload: MemoryPayload }[] };
  }>(`/collections/${GOALS_COLLECTION}/points/scroll`, {
    method: 'POST',
    body: JSON.stringify({
      limit,
      with_payload: true,
      with_vector: false,
    }),
  });

  return response.result.points.map((p) => p.payload);
}

/**
 * Get all goals with IDs (for brain dashboard)
 */
export async function listGoalsWithIds(limit = 50): Promise<{ id: string; payload: MemoryPayload }[]> {
  const response = await qdrantRequest<{
    result: { points: { id: string; payload: MemoryPayload }[] };
  }>(`/collections/${GOALS_COLLECTION}/points/scroll`, {
    method: 'POST',
    body: JSON.stringify({
      limit,
      with_payload: true,
      with_vector: false,
    }),
  });

  return response.result.points.map((p) => ({ id: p.id, payload: p.payload }));
}

/**
 * Delete a goal
 */
export async function deleteGoal(id: string): Promise<void> {
  await deleteFromCollection(GOALS_COLLECTION, id);
}
