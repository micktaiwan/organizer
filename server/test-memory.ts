import { indexMemory, searchMemory, getCollectionInfo } from './src/memory/index.js';

async function test() {
  console.log('=== Test Memory Service ===\n');

  // 1. Index some test messages
  console.log('1. Indexing test messages...');

  await indexMemory({
    type: 'message',
    content: 'On part en vacances en Grèce cet été, je pense à Santorin',
    timestamp: new Date().toISOString(),
    roomId: 'test-room',
    roomName: 'Lobby',
    authorId: 'mickael',
    authorName: 'Mickael',
  });

  await indexMemory({
    type: 'message',
    content: 'Le build Android marche enfin après le fix du gradle',
    timestamp: new Date().toISOString(),
    roomId: 'test-room',
    roomName: 'Lobby',
    authorId: 'david',
    authorName: 'David',
  });

  await indexMemory({
    type: 'message',
    content: 'Tu as regardé le match hier soir ? Le PSG a gagné 3-0',
    timestamp: new Date().toISOString(),
    roomId: 'test-room',
    roomName: 'Lobby',
    authorId: 'mickael',
    authorName: 'Mickael',
  });

  console.log('Done!\n');

  // 2. Search for memories
  console.log('2. Searching for "vacances"...');
  const results1 = await searchMemory('vacances été destination');
  console.log('Results:');
  for (const r of results1) {
    console.log(`  [${r.score.toFixed(3)}] ${r.payload.authorName}: "${r.payload.content}"`);
  }
  console.log();

  console.log('3. Searching for "Android"...');
  const results2 = await searchMemory('problème build Android gradle');
  console.log('Results:');
  for (const r of results2) {
    console.log(`  [${r.score.toFixed(3)}] ${r.payload.authorName}: "${r.payload.content}"`);
  }
  console.log();

  console.log('4. Searching for "foot"...');
  const results3 = await searchMemory('football match score');
  console.log('Results:');
  for (const r of results3) {
    console.log(`  [${r.score.toFixed(3)}] ${r.payload.authorName}: "${r.payload.content}"`);
  }
  console.log();

  // 3. Collection info
  console.log('5. Collection info:');
  const info = await getCollectionInfo();
  console.log(`  Points count: ${info.result.points_count}`);
  console.log(`  Status: ${info.result.status}`);
}

test().catch(console.error);
