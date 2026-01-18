// OpenAI embedding generation
import { OPENAI_API_KEY, EMBEDDING_MODEL } from '../config.mjs';
import { log } from '../logger.mjs';

async function generateEmbedding(text) {
  log('debug', `[Memory] Generating embedding for: "${text.slice(0, 50)}..."`);

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI embedding failed: ${response.status} ${error}`);
  }

  const data = await response.json();
  log('debug', '[Memory] Embedding generated');
  return data.data[0].embedding;
}

export { generateEmbedding };
