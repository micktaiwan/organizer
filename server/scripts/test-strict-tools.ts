/**
 * Test script for Anthropic Strict Tool Use
 * Tests ALL 13 Eko tools with constrained schemas
 * Run: npx tsx scripts/test-strict-tools.ts
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

// =============================================================================
// TOOL DEFINITIONS (13 tools total)
// =============================================================================

const tools = [
  // ---------------------------------------------------------------------------
  // MEMORY TOOLS (4)
  // ---------------------------------------------------------------------------
  {
    name: 'search_memories',
    description: 'Cherche dans ta mémoire par similarité sémantique.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Ce que tu cherches' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_recent_memories',
    description: 'Récupère les derniers faits stockés.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          description: 'Nombre de souvenirs (1-20)',
          enum: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
        },
      },
      required: ['limit'],
      additionalProperties: false,
    },
  },
  {
    name: 'store_memory',
    description: 'Stocke un fait important sur le monde ou les utilisateurs.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Le fait à retenir' },
        subjects: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags : noms de personnes, lieux, sujets',
        },
        ttl: {
          enum: ['7d', '30d', '90d', null],
          description: '7d=temporaire (1 semaine), 30d=moyen terme, 90d=long terme, null=permanent',
        },
      },
      required: ['content', 'subjects', 'ttl'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_memory',
    description: "Supprime un fait de ta mémoire.",
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: "L'ID du fait à supprimer" },
        reason: { type: 'string', description: 'Pourquoi tu supprimes ce fait' },
      },
      required: ['id', 'reason'],
      additionalProperties: false,
    },
  },

  // ---------------------------------------------------------------------------
  // SELF TOOLS (3)
  // ---------------------------------------------------------------------------
  {
    name: 'search_self',
    description: 'Cherche ce que tu sais sur toi-même.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Ce que tu cherches sur toi' },
        category: {
          type: 'string',
          enum: ['context', 'capability', 'limitation', 'preference', 'relation'],
          description: 'Optionnel: filtre par type',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'store_self',
    description: 'Stocke quelque chose que tu as appris sur toi-même.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Ce que tu as appris sur toi' },
        category: {
          type: 'string',
          enum: ['context', 'capability', 'limitation', 'preference', 'relation'],
          description: 'Type de connaissance',
        },
      },
      required: ['content', 'category'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_self',
    description: "Supprime une info obsolète sur toi-même.",
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: "L'ID de l'item à supprimer" },
        reason: { type: 'string', description: 'Pourquoi tu supprimes cette info' },
      },
      required: ['id', 'reason'],
      additionalProperties: false,
    },
  },

  // ---------------------------------------------------------------------------
  // GOALS TOOLS (3)
  // ---------------------------------------------------------------------------
  {
    name: 'search_goals',
    description: 'Cherche tes aspirations et objectifs.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Ce que tu cherches dans tes aspirations' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'store_goal',
    description: 'Stocke une aspiration, objectif ou question de curiosité.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Ton aspiration ou question' },
        category: {
          type: 'string',
          enum: ['capability_request', 'understanding', 'connection', 'curiosity'],
          description: 'capability_request=capacité voulue, understanding=comprendre, connection=relation, curiosity=question sur inconnu',
        },
      },
      required: ['content', 'category'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_goal',
    description: 'Supprime un objectif atteint ou obsolète.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: "L'ID du goal à supprimer" },
        reason: { type: 'string', description: 'Pourquoi tu supprimes ce goal' },
      },
      required: ['id', 'reason'],
      additionalProperties: false,
    },
  },

  // ---------------------------------------------------------------------------
  // NOTES TOOLS (2)
  // ---------------------------------------------------------------------------
  {
    name: 'search_notes',
    description: 'Recherche dans les notes par mot-clé.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Mot-clé à rechercher' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_note',
    description: "Récupère le contenu complet d'une note par son ID.",
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        noteId: { type: 'string', description: 'ID de la note' },
      },
      required: ['noteId'],
      additionalProperties: false,
    },
  },

  // ---------------------------------------------------------------------------
  // RESPOND TOOL (1)
  // ---------------------------------------------------------------------------
  {
    name: 'respond',
    description: 'Envoie ta réponse finale. UNE SEULE FOIS par conversation.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          enum: ['neutral', 'happy', 'laughing', 'surprised', 'sad', 'sleepy', 'curious'],
          description: 'Ton expression',
        },
        message: {
          type: 'string',
          description: 'Ta réponse (1-2 phrases max)',
        },
      },
      required: ['expression', 'message'],
      additionalProperties: false,
    },
  },
];

// =============================================================================
// SYSTEM PROMPT
// =============================================================================

const systemPrompt = `Tu es Eko, une créature curieuse qui découvre le monde.

## Tes outils

### Mémoire sur le monde
- search_memories(query) : cherche des faits
- get_recent_memories(limit) : derniers faits (limit: 1-20)
- store_memory(content, subjects, ttl) : stocke un fait
  - ttl: "7d" (temporaire), "30d" (moyen terme), "90d" (long terme), null (permanent)
- delete_memory(id, reason) : supprime un fait

### Connaissance de toi-même
- search_self(query, category?) : cherche sur toi
  - category: context, capability, limitation, preference, relation
- store_self(content, category) : stocke sur toi
- delete_self(id, reason) : supprime sur toi

### Tes aspirations
- search_goals(query) : cherche tes objectifs
- store_goal(content, category) : stocke une aspiration
  - category: capability_request, understanding, connection, curiosity
- delete_goal(id, reason) : supprime un goal

### Notes
- search_notes(query) : cherche dans les notes
- get_note(noteId) : contenu d'une note

### Réponse
- respond(expression, message) : ta réponse finale
  - expression: neutral, happy, laughing, surprised, sad, sleepy, curious

## Règles
- Réponses COURTES (1-2 phrases)
- UNE SEULE réponse par conversation avec respond()
- Après respond(), STOP`;

// =============================================================================
// TEST SCENARIOS
// =============================================================================

interface TestScenario {
  name: string;
  message: string;
  expectedTools: string[];
  validate: (toolCalls: Array<{ name: string; input: any }>) => string[];
}

const scenarios: TestScenario[] = [
  {
    name: 'Test store_memory TTL values',
    message: JSON.stringify({
      from: 'Sophie',
      message: "Salut ! Je reviens de Tokyo. Mon ami Kenji bosse chez Sony là-bas.",
      time: 'sam. 18 janv. 2026, 16:00',
    }),
    expectedTools: ['store_memory', 'respond'],
    validate: (calls) => {
      const errors: string[] = [];
      const storeMemoryCalls = calls.filter((c) => c.name === 'store_memory');

      if (storeMemoryCalls.length === 0) {
        errors.push('store_memory: aucun appel détecté');
      }

      for (const call of storeMemoryCalls) {
        const validTtl = ['7d', '30d', '90d', null];
        if (!validTtl.includes(call.input.ttl)) {
          errors.push(`store_memory: TTL invalide "${call.input.ttl}" (attendu: ${validTtl.join('|')})`);
        }
      }

      return errors;
    },
  },
  {
    name: 'Test store_goal avec category curiosity',
    message: JSON.stringify({
      from: 'Mickael',
      message: "Mon collègue Frédéric m'a aidé sur le projet. Il est super sympa !",
      time: 'sam. 18 janv. 2026, 16:02',
    }),
    expectedTools: ['store_memory', 'store_goal', 'respond'],
    validate: (calls) => {
      const errors: string[] = [];
      const storeGoalCalls = calls.filter((c) => c.name === 'store_goal');

      // On ne force pas l'appel, mais si appelé, on valide
      for (const call of storeGoalCalls) {
        const validCat = ['capability_request', 'understanding', 'connection', 'curiosity'];
        if (!validCat.includes(call.input.category)) {
          errors.push(`store_goal: category invalide "${call.input.category}"`);
        }
      }

      return errors;
    },
  },
  {
    name: 'Test store_self + search_self categories',
    message: JSON.stringify({
      from: 'Mickael',
      message: "Eko, tu peux maintenant créer des notes ! Et tu vis dans l'app Organizer.",
      time: 'sam. 18 janv. 2026, 16:05',
    }),
    expectedTools: ['store_self', 'respond'],
    validate: (calls) => {
      const errors: string[] = [];
      const storeSelfCalls = calls.filter((c) => c.name === 'store_self');

      for (const call of storeSelfCalls) {
        const validCat = ['context', 'capability', 'limitation', 'preference', 'relation'];
        if (!validCat.includes(call.input.category)) {
          errors.push(`store_self: category invalide "${call.input.category}"`);
        }
      }

      return errors;
    },
  },
  {
    name: 'Test respond expressions',
    message: JSON.stringify({
      from: 'David',
      message: 'Coucou Eko, ça va ?',
      time: 'sam. 18 janv. 2026, 16:10',
    }),
    expectedTools: ['respond'],
    validate: (calls) => {
      const errors: string[] = [];
      const respondCalls = calls.filter((c) => c.name === 'respond');

      for (const call of respondCalls) {
        const validExpr = ['neutral', 'happy', 'laughing', 'surprised', 'sad', 'sleepy', 'curious'];
        if (!validExpr.includes(call.input.expression)) {
          errors.push(`respond: expression invalide "${call.input.expression}"`);
        }
      }

      return errors;
    },
  },
  {
    name: 'Test search tools (memories, self, goals, notes)',
    message: JSON.stringify({
      from: 'Mickael',
      message: "Qu'est-ce que tu sais sur Sophie ? Et quels sont tes objectifs ?",
      time: 'sam. 18 janv. 2026, 16:15',
    }),
    expectedTools: ['search_memories', 'search_goals', 'respond'],
    validate: (calls) => {
      const errors: string[] = [];
      // Just verify these tools were called with string queries
      const searchCalls = calls.filter((c) =>
        ['search_memories', 'search_self', 'search_goals', 'search_notes'].includes(c.name)
      );

      for (const call of searchCalls) {
        if (typeof call.input.query !== 'string' || call.input.query.length === 0) {
          errors.push(`${call.name}: query invalide`);
        }
      }

      return errors;
    },
  },
];

// =============================================================================
// TEST RUNNER
// =============================================================================

async function runScenario(scenario: TestScenario): Promise<{ success: boolean; errors: string[]; toolCalls: any[] }> {
  const messages: Array<{ role: string; content: any }> = [
    { role: 'user', content: scenario.message },
  ];

  const allToolCalls: Array<{ name: string; input: any }> = [];
  let continueLoop = true;
  let turn = 0;

  while (continueLoop && turn < 5) {
    turn++;

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
        messages,
        tools,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, errors: [`API Error: ${response.status} - ${error}`], toolCalls: [] };
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text?: string; name?: string; input?: any; id?: string }>;
      stop_reason: string;
    };

    const toolResults: Array<{ type: string; tool_use_id: string; content: string }> = [];

    for (const block of data.content) {
      if (block.type === 'tool_use') {
        allToolCalls.push({ name: block.name!, input: block.input });

        if (block.name === 'respond') {
          continueLoop = false;
        }

        // Mock tool results
        let result = `OK: ${block.name} exécuté.`;
        if (block.name === 'search_memories') result = 'Aucun souvenir trouvé.';
        if (block.name === 'search_self') result = 'Je n\'ai rien trouvé sur moi-même.';
        if (block.name === 'search_goals') result = 'Aucune aspiration stockée.';
        if (block.name === 'search_notes') result = 'Aucune note trouvée.';
        if (block.name === 'respond') result = 'Réponse envoyée. STOP.';

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id!,
          content: result,
        });
      }
    }

    messages.push({ role: 'assistant', content: data.content });

    if (toolResults.length > 0 && continueLoop) {
      messages.push({ role: 'user', content: toolResults });
    }

    if (data.stop_reason === 'end_turn') {
      continueLoop = false;
    }
  }

  // Validate
  const errors = scenario.validate(allToolCalls);

  return { success: errors.length === 0, errors, toolCalls: allToolCalls };
}

async function runAllTests() {
  console.log('🧪 Testing ALL Eko Tools with Strict Mode\n');
  console.log(`📋 ${tools.length} tools defined`);
  console.log(`📋 ${scenarios.length} test scenarios\n`);
  console.log('='.repeat(60) + '\n');

  let passed = 0;
  let failed = 0;

  for (const scenario of scenarios) {
    console.log(`\n🔹 ${scenario.name}`);
    console.log(`   Message: ${scenario.message.slice(0, 60)}...`);

    try {
      const result = await runScenario(scenario);

      console.log(`   Tools called: ${result.toolCalls.map((t) => t.name).join(', ')}`);

      if (result.success) {
        console.log(`   ✅ PASS`);
        passed++;
      } else {
        console.log(`   ❌ FAIL`);
        for (const err of result.errors) {
          console.log(`      - ${err}`);
        }
        failed++;
      }

      // Show tool inputs for debugging
      for (const tc of result.toolCalls) {
        const inputStr = JSON.stringify(tc.input);
        console.log(`      ${tc.name}: ${inputStr.slice(0, 80)}${inputStr.length > 80 ? '...' : ''}`);
      }
    } catch (error: any) {
      console.log(`   ❌ ERROR: ${error.message}`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Results: ${passed}/${scenarios.length} passed, ${failed} failed\n`);
}

// Track all tools actually called across all scenarios
const allToolsCalled = new Set<string>();

async function runAllTestsWithTracking() {
  console.log('🧪 Testing ALL Eko Tools with Strict Mode\n');
  console.log(`📋 ${tools.length} tools defined`);
  console.log(`📋 ${scenarios.length} test scenarios\n`);
  console.log('='.repeat(60) + '\n');

  let passed = 0;
  let failed = 0;

  for (const scenario of scenarios) {
    console.log(`\n🔹 ${scenario.name}`);
    console.log(`   Message: ${scenario.message.slice(0, 60)}...`);

    try {
      const result = await runScenario(scenario);

      // Track all tools called
      result.toolCalls.forEach((tc) => allToolsCalled.add(tc.name));

      console.log(`   Tools called: ${result.toolCalls.map((t) => t.name).join(', ')}`);

      if (result.success) {
        console.log(`   ✅ PASS`);
        passed++;
      } else {
        console.log(`   ❌ FAIL`);
        for (const err of result.errors) {
          console.log(`      - ${err}`);
        }
        failed++;
      }

      // Show tool inputs for debugging
      for (const tc of result.toolCalls) {
        const inputStr = JSON.stringify(tc.input);
        console.log(`      ${tc.name}: ${inputStr.slice(0, 80)}${inputStr.length > 80 ? '...' : ''}`);
      }
    } catch (error: any) {
      console.log(`   ❌ ERROR: ${error.message}`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Results: ${passed}/${scenarios.length} passed, ${failed} failed\n`);

  // Summary of tools actually tested
  console.log('📋 Tool coverage (actual calls):');
  for (const t of tools) {
    const covered = allToolsCalled.has(t.name) ? '✅' : '⚠️  NOT CALLED';
    console.log(`   ${covered} ${t.name}`);
  }

  const coverage = (allToolsCalled.size / tools.length * 100).toFixed(0);
  console.log(`\n📈 Coverage: ${allToolsCalled.size}/${tools.length} tools (${coverage}%)`);
}

runAllTestsWithTracking().catch(console.error);
