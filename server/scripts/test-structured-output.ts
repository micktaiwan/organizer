/**
 * Test script for Anthropic Structured Outputs
 * Run: npx tsx scripts/test-structured-output.ts
 */

import fs from 'fs';
import path from 'path';

// Load API key from agent-config.json
const configPath = path.join(process.cwd(), 'agent-config.json');
if (!fs.existsSync(configPath)) {
  console.error('❌ agent-config.json not found');
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
const ANTHROPIC_API_KEY = config.anthropicApiKey;

if (!ANTHROPIC_API_KEY) {
  console.error('❌ anthropicApiKey not set in agent-config.json');
  process.exit(1);
}

// TTL options: 7d (1 week), 30d (1 month), 90d (3 months), null (permanent)
type TTLValue = '7d' | '30d' | '90d' | null;

interface DigestResult {
  facts: Array<{
    content: string;
    subjects: string[];
    ttl: TTLValue;
  }>;
  self: Array<{
    content: string;
    category: 'context' | 'capability' | 'limitation' | 'preference' | 'relation';
  }>;
  goals: Array<{
    content: string;
    category: 'capability_request' | 'understanding' | 'connection' | 'curiosity';
  }>;
}

const schema = {
  type: 'object',
  properties: {
    facts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          content: { type: 'string' },
          subjects: { type: 'array', items: { type: 'string' } },
          ttl: {
            enum: ['7d', '30d', '90d', null],
            description: '7d=temporaire (1 semaine), 30d=moyen terme, 90d=long terme, null=permanent',
          },
        },
        required: ['content', 'subjects', 'ttl'],
        additionalProperties: false,
      },
    },
    self: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          content: { type: 'string' },
          category: {
            type: 'string',
            enum: ['context', 'capability', 'limitation', 'preference', 'relation'],
          },
        },
        required: ['content', 'category'],
        additionalProperties: false,
      },
    },
    goals: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          content: { type: 'string' },
          category: {
            type: 'string',
            enum: ['capability_request', 'understanding', 'connection', 'curiosity'],
          },
        },
        required: ['content', 'category'],
        additionalProperties: false,
      },
    },
  },
  required: ['facts', 'self', 'goals'],
  additionalProperties: false,
};

const testMessages = `[18/01/2026 14:49] Sophie: hey je viens de rentrer de Tokyo, c'était incroyable !
[18/01/2026 14:52] Thomas: ah cool ! t'as vu mon pote Julien là-bas ? il bosse chez Nintendo
[18/01/2026 14:55] Sophie: non j'ai pas eu le temps, mais je suis passée voir ta soeur à Kyoto par contre
[18/01/2026 14:58] Thomas: ah génial ! elle va bien ? ça fait des mois que je l'ai pas appelée`;

const systemPrompt = `Tu es un assistant qui analyse les conversations du Lobby pour un petit agent nommé Eko.

## Ta tâche
Extraire 3 types d'informations :
1. **facts** : faits sur les utilisateurs (Mickael, David, etc.)
2. **self** : ce qu'Eko apprend sur lui-même (si les humains parlent de lui)
3. **goals** : aspirations qu'Eko pourrait développer (basées sur ce qu'il observe)

## 1. FACTS (sur les humains)
Ce qu'il faut extraire :
- Relations : "David est le frère de Mickael"
- Événements de vie : "Mickael s'est cassé l'épaule"
- Voyages : "David part en Grèce en février"
- Préférences : "Mickael aime le ski"
- Lieux de vie : "David habite à Ordizan"

Ce qu'il NE faut PAS extraire :
- Salutations, bavardages ("ok", "lol", "cool")
- États très temporaires ("je suis fatigué")
- Infos générales sur le monde

## 2. SELF (ce qu'Eko apprend sur lui-même)
Extraire si les humains :
- Parlent d'Eko directement : "Eko peut maintenant répondre dans les salons" → capability
- Lui expliquent où il vit : "Tu es dans l'app Organizer" → context
- Lui donnent des limites : "Tu ne peux pas encore créer de notes" → limitation
- Expriment une relation : "Eko, tu es notre assistant préféré" → relation

Categories: context, capability, limitation, preference, relation

## 3. GOALS (aspirations émergentes)
Déduire des aspirations si :
- Un sujet revient souvent qu'Eko ne peut pas traiter → capability_request
  Ex: Ils parlent beaucoup de recherches web → "J'aimerais pouvoir chercher sur le web"
- Un sujet complexe qu'Eko pourrait vouloir comprendre → understanding
  Ex: Discussions techniques récurrentes → "Je veux mieux comprendre leur travail"
- Une relation à développer → connection
  Ex: Un humain interagit peu avec Eko → "J'aimerais que X me parle plus"
- Une personne ou chose inconnue mentionnée → curiosity
  Ex: Quelqu'un parle de "Max" ou "Maxime" → "Qui est Maxime ? Quel est son lien avec les autres ?"
  Ex: Référence à un lieu ou événement inconnu → "C'est quoi/où ça, X ?"

IMPORTANT : Les goals doivent être SUBTILS et ÉMERGENTS, pas une liste de souhaits évidente.
Ne génère un goal QUE si c'est vraiment pertinent basé sur la conversation.

Categories: capability_request, understanding, connection, curiosity`;

async function testStructuredOutput() {
  console.log('🧪 Testing Anthropic Structured Outputs...\n');
  console.log('📝 Test messages:');
  console.log(testMessages);
  console.log('\n---\n');

  const startTime = Date.now();

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'structured-outputs-2025-11-13',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: `Analyse ces messages:\n\n${testMessages}`,
          },
        ],
        output_format: {
          type: 'json_schema',
          schema,
        },
      }),
    });

    const duration = Date.now() - startTime;

    if (!response.ok) {
      const error = await response.text();
      console.error(`❌ API Error: ${response.status}`);
      console.error(error);
      return;
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text?: string }>;
      stop_reason: string;
      usage: { input_tokens: number; output_tokens: number };
    };

    console.log(`✅ Response received in ${duration}ms`);
    console.log(`📊 Tokens: ${data.usage.input_tokens} in / ${data.usage.output_tokens} out`);
    console.log(`🛑 Stop reason: ${data.stop_reason}\n`);

    const textContent = data.content.find((c) => c.type === 'text');
    if (!textContent?.text) {
      console.error('❌ No text content in response');
      return;
    }

    console.log('📄 Raw response:');
    console.log(textContent.text);
    console.log('\n---\n');

    // Try to parse
    try {
      const parsed = JSON.parse(textContent.text) as DigestResult;
      console.log('✅ JSON parsed successfully!\n');

      console.log(`📌 Facts (${parsed.facts.length}):`);
      for (const fact of parsed.facts) {
        console.log(`  - ${fact.content}`);
        console.log(`    subjects: [${fact.subjects.join(', ')}], ttl: ${fact.ttl}`);
      }

      console.log(`\n🤖 Self (${parsed.self.length}):`);
      for (const s of parsed.self) {
        console.log(`  - [${s.category}] ${s.content}`);
      }

      console.log(`\n🎯 Goals (${parsed.goals.length}):`);
      for (const goal of parsed.goals) {
        console.log(`  - [${goal.category}] ${goal.content}`);
      }
    } catch (parseError) {
      console.error('❌ JSON parse failed:', parseError);
    }
  } catch (error) {
    console.error('❌ Request failed:', error);
  }
}

testStructuredOutput();
