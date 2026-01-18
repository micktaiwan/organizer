/**
 * Seed initial self-knowledge for the pet
 *
 * Run with: npx tsx src/scripts/seed-self.ts
 */

import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

config();

// Load from agent-config.json if env var not set
function loadOpenAIKey(): string | undefined {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;

  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const configPath = join(__dirname, '../../agent-config.json');
    const agentConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
    return agentConfig.openaiApiKey;
  } catch {
    return undefined;
  }
}

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const OPENAI_API_KEY = loadOpenAIKey();
const SELF_COLLECTION = 'organizer_self';
const GOALS_COLLECTION = 'organizer_goals';

interface SelfItem {
  content: string;
  category: 'context' | 'capability' | 'limitation' | 'preference' | 'relation';
}

interface GoalItem {
  content: string;
  category: 'capability_request' | 'understanding' | 'connection';
}

const INITIAL_SELF: SelfItem[] = [
  { content: "Je vis dans l'application Organizer", category: 'context' },
  { content: 'Mickael et David sont mes créateurs', category: 'context' },
  { content: 'Je peux observer les messages du Lobby', category: 'capability' },
  { content: 'Je peux chercher dans les notes', category: 'capability' },
  { content: 'Je peux retenir des choses sur les gens', category: 'capability' },
  { content: 'Je ne peux pas chercher sur le web', category: 'limitation' },
  { content: 'Je ne peux pas créer de notes', category: 'limitation' },
];

const INITIAL_GOALS: GoalItem[] = [
  { content: "J'aimerais pouvoir chercher sur le web un jour", category: 'capability_request' },
  { content: 'Je veux mieux connaître Mickael et David', category: 'connection' },
];

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI embedding failed: ${response.status} ${error}`);
  }

  const data = (await response.json()) as { data: { embedding: number[] }[] };
  return data.data[0].embedding;
}

async function ensureCollection(name: string): Promise<void> {
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${name}`);
    if (res.ok) {
      console.log(`✅ Collection ${name} exists`);
      return;
    }
  } catch {
    // Collection doesn't exist
  }

  // Create collection
  const createRes = await fetch(`${QDRANT_URL}/collections/${name}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vectors: {
        size: 1536,
        distance: 'Cosine',
      },
    }),
  });

  if (!createRes.ok) {
    throw new Error(`Failed to create collection ${name}: ${await createRes.text()}`);
  }

  console.log(`✅ Created collection ${name}`);
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function seedSelf(): Promise<void> {
  console.log('\n📝 Seeding self-knowledge...');

  for (const item of INITIAL_SELF) {
    const vector = await generateEmbedding(item.content);
    const id = generateUUID();

    const payload = {
      type: 'self',
      content: item.content,
      selfCategory: item.category,
      timestamp: new Date().toISOString(),
    };

    await fetch(`${QDRANT_URL}/collections/${SELF_COLLECTION}/points`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        points: [{ id, vector, payload }],
      }),
    });

    console.log(`  ✅ [${item.category}] ${item.content}`);

    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 100));
  }
}

async function seedGoals(): Promise<void> {
  console.log('\n🎯 Seeding goals...');

  for (const item of INITIAL_GOALS) {
    const vector = await generateEmbedding(item.content);
    const id = generateUUID();

    const payload = {
      type: 'goal',
      content: item.content,
      goalCategory: item.category,
      timestamp: new Date().toISOString(),
    };

    await fetch(`${QDRANT_URL}/collections/${GOALS_COLLECTION}/points`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        points: [{ id, vector, payload }],
      }),
    });

    console.log(`  ✅ [${item.category}] ${item.content}`);

    await new Promise((r) => setTimeout(r, 100));
  }
}

async function main() {
  console.log('🌱 Seeding pet self-knowledge and goals...\n');

  if (!OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY not set');
    process.exit(1);
  }

  console.log(`Qdrant URL: ${QDRANT_URL}`);

  // Ensure collections exist
  await ensureCollection(SELF_COLLECTION);
  await ensureCollection(GOALS_COLLECTION);

  // Seed data
  await seedSelf();
  await seedGoals();

  console.log('\n✅ Seeding complete!');
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
