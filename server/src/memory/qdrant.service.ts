import { createHash } from 'crypto';
import { generateEmbedding, generateEmbeddings } from './embedding.service.js';
import type { FactMemoryInput, MemoryPayload, MemorySearchOptions, MemorySearchResult } from './types.js';

const SIMILARITY_THRESHOLD = 0.5;
const DEDUP_THRESHOLD = 0.85;

export const QDRANT_URL = process.env.QDRANT_URL || 'http://qdrant:6333';
const COLLECTION_NAME = 'organizer_memory';

interface QdrantSearchResponse {
  result: { id: string; score: number; payload: MemoryPayload }[];
  status: string;
  time: number;
}

interface QdrantCollectionResponse {
  result: {
    status: string;
    indexed_vectors_count: number;
    points_count: number;
    config?: {
      params?: {
        vectors?: {
          size?: number;
          distance?: string;
        };
      };
    };
  };
  status: string;
  time: number;
}

interface QdrantUpsertResponse {
  result: { status: string };
  status: string;
  time: number;
}

export async function qdrantRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${QDRANT_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Qdrant request failed: ${response.status} ${error}`);
  }

  return (await response.json()) as T;
}

function generateId(payload: MemoryPayload): string {
  // Create a unique string based on payload type and identifiers
  let uniqueStr = `${payload.type}_${payload.timestamp}`;

  switch (payload.type) {
    case 'message':
      uniqueStr += `_${payload.roomId}_${payload.authorId}`;
      break;
    case 'note':
      uniqueStr += `_${payload.noteId}`;
      break;
    case 'file':
      uniqueStr += `_${payload.fileId}`;
      break;
    case 'pet_conversation':
      uniqueStr += '_pet';
      break;
  }

  // Convert to UUID format using MD5 hash
  const hash = createHash('md5').update(uniqueStr).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

export async function indexMemory(payload: MemoryPayload): Promise<void> {
  const vector = await generateEmbedding(payload.content);
  const id = generateId(payload);

  await qdrantRequest<QdrantUpsertResponse>(`/collections/${COLLECTION_NAME}/points`, {
    method: 'PUT',
    body: JSON.stringify({
      points: [
        {
          id,
          vector,
          payload,
        },
      ],
    }),
  });

  console.log(`[Memory] Indexed: ${payload.type} - "${payload.content.slice(0, 50)}..."`);
}

export async function indexMemoryBatch(payloads: MemoryPayload[]): Promise<void> {
  if (payloads.length === 0) return;

  const texts = payloads.map((p) => p.content);
  const vectors = await generateEmbeddings(texts);

  const points = payloads.map((payload, i) => ({
    id: generateId(payload),
    vector: vectors[i],
    payload,
  }));

  await qdrantRequest<QdrantUpsertResponse>(`/collections/${COLLECTION_NAME}/points`, {
    method: 'PUT',
    body: JSON.stringify({ points }),
  });

  console.log(`[Memory] Batch indexed: ${payloads.length} documents`);
}

export async function searchMemory(
  query: string,
  options: MemorySearchOptions = {}
): Promise<MemorySearchResult[]> {
  const { types, roomId, authorId, since, limit = 5 } = options;

  const vector = await generateEmbedding(query);

  // Build filter conditions
  const mustConditions: object[] = [];

  if (types && types.length > 0) {
    mustConditions.push({
      key: 'type',
      match: { any: types },
    });
  }

  if (roomId) {
    mustConditions.push({
      key: 'roomId',
      match: { value: roomId },
    });
  }

  if (authorId) {
    mustConditions.push({
      key: 'authorId',
      match: { value: authorId },
    });
  }

  if (since) {
    mustConditions.push({
      key: 'timestamp',
      range: { gte: since.toISOString() },
    });
  }

  const filter = mustConditions.length > 0 ? { must: mustConditions } : undefined;

  const result = await qdrantRequest<QdrantSearchResponse>(
    `/collections/${COLLECTION_NAME}/points/search`,
    {
      method: 'POST',
      body: JSON.stringify({
        vector,
        limit,
        with_payload: true,
        filter,
      }),
    }
  );

  return result.result.map((item) => ({
    id: item.id,
    score: item.score,
    payload: item.payload,
  }));
}

export async function getCollectionInfo(): Promise<QdrantCollectionResponse> {
  return qdrantRequest<QdrantCollectionResponse>(`/collections/${COLLECTION_NAME}`);
}

interface QdrantScrollResponse {
  result: {
    points: { id: string; payload: MemoryPayload }[];
    next_page_offset: string | null;
  };
  status: string;
  time: number;
}

export async function deleteMemory(id: string): Promise<void> {
  await qdrantRequest(`/collections/${COLLECTION_NAME}/points/delete`, {
    method: 'POST',
    body: JSON.stringify({
      points: [id],
    }),
  });
  console.log(`[Memory] Deleted: ${id}`);
}

/**
 * Parse TTL string ("7d", "1h", "30m") to ISO date string
 */
function parseTTL(ttl: string | null): string | null {
  if (!ttl) return null;

  const match = ttl.match(/^(\d+)([dhm])$/);
  if (!match) {
    console.warn(`[Memory] Invalid TTL format: ${ttl}`);
    return null;
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  const now = new Date();
  switch (unit) {
    case 'd':
      now.setDate(now.getDate() + value);
      break;
    case 'h':
      now.setHours(now.getHours() + value);
      break;
    case 'm':
      now.setMinutes(now.getMinutes() + value);
      break;
  }

  return now.toISOString();
}

/**
 * Store a fact memory with deduplication.
 * If a similar fact exists (score > 0.5), delete it and insert the new one.
 */
export async function storeFactMemory(input: FactMemoryInput): Promise<void> {
  const { content, subjects, ttl } = input;

  // Search for similar existing facts
  const similar = await searchMemory(content, {
    types: ['fact'],
    limit: 1,
  });

  // If very similar fact exists (>0.85), delete it (we'll insert the updated version)
  if (similar.length > 0 && similar[0].score >= DEDUP_THRESHOLD) {
    console.log(
      `[Memory] Found similar fact (score ${similar[0].score.toFixed(2)}): "${similar[0].payload.content.slice(0, 50)}..."`
    );
    await deleteMemory(similar[0].id);
  }

  // Create the fact payload
  const payload: MemoryPayload = {
    type: 'fact',
    content,
    subjects,
    expiresAt: parseTTL(ttl),
    timestamp: new Date().toISOString(),
  };

  await indexMemory(payload);
  console.log(`[Memory] Stored fact: "${content.slice(0, 50)}..." (ttl: ${ttl || 'permanent'})`);
}

/**
 * Search for facts relevant to a query
 */
export async function searchFacts(query: string, limit = 5): Promise<MemorySearchResult[]> {
  return searchMemory(query, {
    types: ['fact'],
    limit,
  });
}

/**
 * List all facts (for brain dashboard)
 */
export async function listFacts(limit = 50): Promise<{ id: string; payload: MemoryPayload }[]> {
  const result = await qdrantRequest<QdrantScrollResponse>(
    `/collections/${COLLECTION_NAME}/points/scroll`,
    {
      method: 'POST',
      body: JSON.stringify({
        filter: {
          must: [{ key: 'type', match: { value: 'fact' } }],
        },
        limit,
        with_payload: true,
        with_vector: false,
      }),
    }
  );

  // Sort by timestamp DESC (most recent first)
  return result.result.points
    .map((p) => ({ id: p.id, payload: p.payload }))
    .sort((a, b) => {
      const timeA = new Date(a.payload.timestamp).getTime();
      const timeB = new Date(b.payload.timestamp).getTime();
      return timeB - timeA;
    });
}

/**
 * Delete a fact by ID
 */
export async function deleteFact(id: string): Promise<void> {
  await deleteMemory(id);
}

/**
 * Delete expired memories (for cron job)
 */
export async function deleteExpiredMemories(): Promise<number> {
  const now = new Date().toISOString();

  // Scroll through all facts and find expired ones
  const result = await qdrantRequest<{
    result: { points: { id: string; payload: MemoryPayload }[] };
  }>(`/collections/${COLLECTION_NAME}/points/scroll`, {
    method: 'POST',
    body: JSON.stringify({
      filter: {
        must: [
          { key: 'type', match: { value: 'fact' } },
          { key: 'expiresAt', range: { lt: now } },
        ],
      },
      limit: 100,
      with_payload: true,
    }),
  });

  const expiredIds = result.result.points.map((p) => p.id);

  if (expiredIds.length > 0) {
    await qdrantRequest(`/collections/${COLLECTION_NAME}/points/delete`, {
      method: 'POST',
      body: JSON.stringify({ points: expiredIds }),
    });
    console.log(`[Memory] Deleted ${expiredIds.length} expired memories`);
  }

  return expiredIds.length;
}
