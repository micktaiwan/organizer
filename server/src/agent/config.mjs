// Configuration constants for the Pet agent

const QDRANT_URL = process.env.QDRANT_URL || 'http://qdrant:6333';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MONGODB_URI = process.env.MONGODB_URI;
const COLLECTION_NAME = 'organizer_memory';
const LIVE_COLLECTION_NAME = 'organizer_live';
const SELF_COLLECTION_NAME = 'organizer_self';
const GOALS_COLLECTION_NAME = 'organizer_goals';
const EMBEDDING_MODEL = 'text-embedding-3-small';
const DEDUP_THRESHOLD = 0.85;

export { QDRANT_URL, OPENAI_API_KEY, MONGODB_URI, COLLECTION_NAME, LIVE_COLLECTION_NAME, SELF_COLLECTION_NAME, GOALS_COLLECTION_NAME, EMBEDDING_MODEL, DEDUP_THRESHOLD };
