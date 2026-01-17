import { createHash } from 'crypto';
import { generateEmbedding } from './embedding.service.js';
import { qdrantRequest, QDRANT_URL } from './qdrant.service.js';

const COLLECTION_NAME = 'organizer_live';
const VECTOR_SIZE = 1536; // text-embedding-3-small

/**
 * Generate a valid UUID from a string (Qdrant requires UUID or positive integer)
 */
function generateUUID(input: string): string {
  const hash = createHash('md5').update(input).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

export interface LiveMessagePayload {
  content: string;
  author: string;
  authorId: string;
  room: string;
  roomId: string;
  timestamp: string;
}

interface QdrantSearchResult {
  id: string;
  score: number;
  payload: LiveMessagePayload;
}

/**
 * Ensure the "live" collection exists in Qdrant
 */
export async function ensureLiveCollection(): Promise<void> {
  // Check if collection exists
  const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
    headers: { 'Content-Type': 'application/json' },
  });

  if (response.ok) {
    console.log(`[Live] Collection "${COLLECTION_NAME}" exists`);
    return;
  }

  if (response.status !== 404) {
    const error = await response.text();
    throw new Error(`[Live] Failed to check collection: ${response.status} ${error}`);
  }

  // Collection doesn't exist, create it
  console.log(`[Live] Creating collection "${COLLECTION_NAME}"...`);
  await qdrantRequest(`/collections/${COLLECTION_NAME}`, {
    method: 'PUT',
    body: JSON.stringify({
      vectors: {
        size: VECTOR_SIZE,
        distance: 'Cosine',
      },
    }),
  });
  console.log(`[Live] Collection "${COLLECTION_NAME}" created`);
}

/**
 * Index a message in the live collection
 */
export async function indexLiveMessage(payload: LiveMessagePayload & { messageId?: string }): Promise<void> {
  // Skip very short messages (likely noise)
  if (payload.content.length < 3) {
    return;
  }

  const vector = await generateEmbedding(payload.content);
  // Use messageId for stable UUID (prevents double indexing from REST + socket)
  const id = generateUUID(payload.messageId || `${payload.roomId}-${payload.timestamp}-${payload.authorId}`);

  await qdrantRequest(`/collections/${COLLECTION_NAME}/points`, {
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

  console.log(`[Live] Indexed: ${payload.author}: "${payload.content.slice(0, 40)}..."`);
}

/**
 * Search live messages by semantic similarity
 */
export async function searchLiveMessages(query: string, limit = 10): Promise<QdrantSearchResult[]> {
  const vector = await generateEmbedding(query);

  const result = await qdrantRequest<{
    result: { id: string; score: number; payload: LiveMessagePayload }[];
  }>(`/collections/${COLLECTION_NAME}/points/search`, {
    method: 'POST',
    body: JSON.stringify({
      vector,
      limit,
      with_payload: true,
    }),
  });

  return result.result.map((item) => ({
    id: item.id,
    score: item.score,
    payload: item.payload,
  }));
}

/**
 * Get all messages from live collection (for digest)
 * Uses pagination to handle >1000 messages
 */
interface ScrollResponse<T> {
  result: {
    points: T[];
    next_page_offset: string | null;
  };
}

export async function getAllLiveMessages(): Promise<LiveMessagePayload[]> {
  const allPayloads: LiveMessagePayload[] = [];
  let offset: string | null = null;
  const BATCH_SIZE = 1000;

  do {
    const result: ScrollResponse<{ id: string; payload: LiveMessagePayload }> = await qdrantRequest(
      `/collections/${COLLECTION_NAME}/points/scroll`,
      {
        method: 'POST',
        body: JSON.stringify({
          limit: BATCH_SIZE,
          offset: offset,
          with_payload: true,
          with_vector: false,
        }),
      }
    );

    allPayloads.push(...result.result.points.map((p) => p.payload));
    offset = result.result.next_page_offset;
  } while (offset !== null);

  // Sort by timestamp ASC (chronological order for digest)
  return allPayloads.sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime();
    const timeB = new Date(b.timestamp).getTime();
    // Handle invalid dates
    if (isNaN(timeA)) return 1;
    if (isNaN(timeB)) return -1;
    return timeA - timeB;
  });
}

/**
 * Clear all messages from live collection (after digest)
 * Uses pagination to handle >1000 messages
 */
export async function clearLiveCollection(): Promise<number> {
  const allIds: string[] = [];
  let offset: string | null = null;
  const BATCH_SIZE = 1000;

  // Collect all IDs with pagination
  do {
    const result: ScrollResponse<{ id: string }> = await qdrantRequest(
      `/collections/${COLLECTION_NAME}/points/scroll`,
      {
        method: 'POST',
        body: JSON.stringify({
          limit: BATCH_SIZE,
          offset: offset,
          with_payload: false,
          with_vector: false,
        }),
      }
    );

    allIds.push(...result.result.points.map((p) => p.id));
    offset = result.result.next_page_offset;
  } while (offset !== null);

  if (allIds.length === 0) {
    return 0;
  }

  // Delete in batches to avoid too large requests
  for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
    const batch = allIds.slice(i, i + BATCH_SIZE);
    await qdrantRequest(`/collections/${COLLECTION_NAME}/points/delete`, {
      method: 'POST',
      body: JSON.stringify({
        points: batch,
      }),
    });
  }

  console.log(`[Live] Cleared ${allIds.length} messages from live collection`);
  return allIds.length;
}

/**
 * Get collection stats
 */
export async function getLiveCollectionInfo(): Promise<{ pointsCount: number }> {
  try {
    const result = await qdrantRequest<{
      result: { points_count: number };
    }>(`/collections/${COLLECTION_NAME}`);
    return { pointsCount: result.result.points_count };
  } catch {
    return { pointsCount: 0 };
  }
}
