import { openDB, DBSchema, IDBPDatabase } from 'idb';

const DB_NAME = 'organizer-eko';
const DB_VERSION = 1;
const STORE_NAME = 'messages';
const MAX_MESSAGES = 50;

export type EkoServerId = 'local' | 'prod';
export type EkoMessageRole = 'user' | 'eko';

export interface CachedEkoMessage {
  id: string;
  serverId: EkoServerId;
  role: EkoMessageRole;
  content: string;
  expression?: string;
  timestamp: number;
}

interface EkoDBSchema extends DBSchema {
  [STORE_NAME]: {
    key: string;
    value: CachedEkoMessage;
    indexes: { 'by-server': EkoServerId };
  };
}

let dbPromise: Promise<IDBPDatabase<EkoDBSchema>> | null = null;

const getDB = (): Promise<IDBPDatabase<EkoDBSchema>> => {
  if (!dbPromise) {
    dbPromise = openDB<EkoDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('by-server', 'serverId');
        }
      },
    });
  }
  return dbPromise;
};

/**
 * Load messages for a specific server from IndexedDB
 */
export const loadEkoMessages = async (serverId: EkoServerId): Promise<CachedEkoMessage[]> => {
  try {
    const db = await getDB();
    const messages = await db.getAllFromIndex(STORE_NAME, 'by-server', serverId);
    // Sort by timestamp ascending (oldest first)
    return messages.sort((a, b) => a.timestamp - b.timestamp);
  } catch (error) {
    console.error('[EkoCache] Failed to load messages:', error);
    return [];
  }
};

/**
 * Save a message to IndexedDB, enforcing FIFO limit
 */
export const saveEkoMessage = async (message: CachedEkoMessage): Promise<void> => {
  try {
    const db = await getDB();

    // Add the new message
    await db.put(STORE_NAME, message);

    // Enforce FIFO limit per server
    const allMessages = await db.getAllFromIndex(STORE_NAME, 'by-server', message.serverId);
    if (allMessages.length > MAX_MESSAGES) {
      // Sort by timestamp and remove oldest
      const sorted = allMessages.sort((a, b) => a.timestamp - b.timestamp);
      const toDelete = sorted.slice(0, allMessages.length - MAX_MESSAGES);
      const tx = db.transaction(STORE_NAME, 'readwrite');
      await Promise.all(toDelete.map(msg => tx.store.delete(msg.id)));
      await tx.done;
    }
  } catch (error) {
    console.error('[EkoCache] Failed to save message:', error);
  }
};

/**
 * Clear all messages for a specific server
 */
export const clearEkoMessages = async (serverId: EkoServerId): Promise<void> => {
  try {
    const db = await getDB();
    const messages = await db.getAllFromIndex(STORE_NAME, 'by-server', serverId);
    const tx = db.transaction(STORE_NAME, 'readwrite');
    await Promise.all(messages.map(msg => tx.store.delete(msg.id)));
    await tx.done;
  } catch (error) {
    console.error('[EkoCache] Failed to clear messages:', error);
  }
};
