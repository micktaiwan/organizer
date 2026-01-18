#!/usr/bin/env node
/**
 * Split Chat.css into logical component files
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const INPUT = 'src/components/Chat/Chat.css';
const css = readFileSync(INPUT, 'utf-8');

const BASE = 'src/components/Chat';

// Mapping: selector patterns → output file
const ROUTES = {
  // MessageList - messages, bubbles, timestamps
  '.message': `${BASE}/MessageList.css`,
  '.bubble': `${BASE}/MessageList.css`,
  '.timestamp': `${BASE}/MessageList.css`,
  '.system-message': `${BASE}/MessageList.css`,
  '.read-icon': `${BASE}/MessageList.css`,
  '.sent-icon': `${BASE}/MessageList.css`,

  // MessageReactions - reactions and delete
  '.reaction': `${BASE}/MessageReactions.css`,
  '.delete-': `${BASE}/MessageReactions.css`,

  // RoomList - room list items
  '.room-list': `${BASE}/RoomList.css`,
  '.room-item': `${BASE}/RoomList.css`,
  '.room-avatar': `${BASE}/RoomList.css`,
  '.room-info': `${BASE}/RoomList.css`,
  '.room-name': `${BASE}/RoomList.css`,
  '.room-last': `${BASE}/RoomList.css`,
  '.room-unread': `${BASE}/RoomList.css`,
  '.room-time': `${BASE}/RoomList.css`,
  '.unread-': `${BASE}/RoomList.css`,

  // RoomMembers - member list in room
  '.room-members': `${BASE}/RoomMembers.css`,
  '.room-member': `${BASE}/RoomMembers.css`,
  '.member-': `${BASE}/RoomMembers.css`,

  // FileMessage - file attachments and images
  '.file-': `${BASE}/FileMessage.css`,
  '.pending-file': `${BASE}/FileMessage.css`,
  '.pending-image': `${BASE}/FileMessage.css`,
  '.image-': `${BASE}/FileMessage.css`,
  '.cancel-file': `${BASE}/FileMessage.css`,
  '.cancel-image': `${BASE}/FileMessage.css`,
  '.attach-btn': `${BASE}/FileMessage.css`,

  // VideoCall - video/audio calls
  '.call': `${BASE}/VideoCall.css`,
  '.caller-': `${BASE}/VideoCall.css`,
  '.calling-': `${BASE}/VideoCall.css`,
  '.incoming-call': `${BASE}/VideoCall.css`,
  '.video-': `${BASE}/VideoCall.css`,
  '.local-video': `${BASE}/VideoCall.css`,
  '.remote-video': `${BASE}/VideoCall.css`,
  '.control-btn': `${BASE}/VideoCall.css`,
  '.accept-btn': `${BASE}/VideoCall.css`,
  '.reject-btn': `${BASE}/VideoCall.css`,
  '.end-call': `${BASE}/VideoCall.css`,

  // AudioMessage - audio recording/playback
  '.audio-': `${BASE}/AudioMessage.css`,
  '.recording-': `${BASE}/AudioMessage.css`,
  '.voice-btn': `${BASE}/AudioMessage.css`,
  '.stop-recording': `${BASE}/AudioMessage.css`,
  '.cancel-recording': `${BASE}/AudioMessage.css`,

  // ContactList - contacts
  '.contact': `${BASE}/ContactList.css`,
  '.contacts-': `${BASE}/ContactList.css`,
  '.no-contacts': `${BASE}/ContactList.css`,

  // UserStatus - status indicators
  '.status-dot': `${BASE}/UserStatus.css`,
  '.sender-status': `${BASE}/UserStatus.css`,
  '.typing-': `${BASE}/UserStatus.css`,

  // ChatLayout - main layout, headers
  '.chat-': `${BASE}/ChatLayout.css`,
  '.header-group': `${BASE}/ChatLayout.css`,
  '.header-actions': `${BASE}/ChatLayout.css`,
};

// Output buckets
const buckets = {};

// Initialize buckets
for (const file of new Set(Object.values(ROUTES))) {
  buckets[file] = [];
}
// Fallback bucket for unmatched
buckets[`${BASE}/ChatMisc.css`] = [];

/**
 * Parse CSS into blocks (handles nested braces correctly)
 */
function parseBlocks(css) {
  const blocks = [];
  let i = 0;

  while (i < css.length) {
    while (i < css.length && /\s/.test(css[i])) i++;
    if (i >= css.length) break;

    if (css.slice(i, i + 2) === '/*') {
      const end = css.indexOf('*/', i + 2);
      if (end === -1) break;
      i = end + 2;
      continue;
    }

    const openBrace = css.indexOf('{', i);
    if (openBrace === -1) break;

    const selector = css.slice(i, openBrace).trim();

    let depth = 1;
    let j = openBrace + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}') depth--;
      j++;
    }

    const body = css.slice(openBrace + 1, j - 1);
    const fullBlock = css.slice(i, j);

    blocks.push({ selector, body, fullBlock, start: i, end: j });
    i = j;
  }

  return blocks;
}

/**
 * Route a selector to the right file
 */
function routeSelector(selector) {
  const sel = selector.toLowerCase();

  for (const [prefix, file] of Object.entries(ROUTES)) {
    if (sel.includes(prefix)) {
      return file;
    }
  }

  return `${BASE}/ChatMisc.css`;
}

/**
 * Handle @media blocks - split their contents
 */
function processMediaBlock(block) {
  const innerBlocks = parseBlocks(block.body);

  if (innerBlocks.length === 0) {
    buckets[`${BASE}/ChatMisc.css`].push(block.fullBlock);
    return;
  }

  const mediaGroups = {};

  for (const inner of innerBlocks) {
    const dest = routeSelector(inner.selector);
    if (!mediaGroups[dest]) mediaGroups[dest] = [];
    mediaGroups[dest].push(inner.fullBlock);
  }

  for (const [dest, rules] of Object.entries(mediaGroups)) {
    const mediaBlock = `${block.selector} {\n${rules.join('\n\n')}\n}`;
    buckets[dest].push(mediaBlock);
  }
}

// Parse all blocks
const blocks = parseBlocks(css);

console.log(`Parsed ${blocks.length} top-level blocks from Chat.css`);

// Route each block
for (const block of blocks) {
  if (block.selector.startsWith('@media')) {
    processMediaBlock(block);
  } else if (block.selector.startsWith('@keyframes')) {
    const dest = routeSelector(block.selector);
    buckets[dest].push(block.fullBlock);
  } else {
    const dest = routeSelector(block.selector);
    buckets[dest].push(block.fullBlock);
  }
}

// Write output files
const created = [];
for (const [file, rules] of Object.entries(buckets)) {
  if (rules.length === 0) continue;

  mkdirSync(dirname(file), { recursive: true });

  const content = rules.join('\n\n') + '\n';
  writeFileSync(file, content);
  const lines = content.split('\n').length;
  console.log(`✓ ${file.replace(BASE + '/', '')}: ${rules.length} blocks, ${lines} lines`);
  created.push(file.replace(BASE + '/', ''));
}

// Create new Chat.css with imports
const imports = created
  .filter(f => f !== 'Chat.css')
  .map(f => `@import './${f}';`)
  .join('\n');

const newChatCss = `/* Chat component styles */\n${imports}\n`;
writeFileSync(`${BASE}/Chat.css`, newChatCss);
console.log(`\n✓ Updated Chat.css with ${created.length} imports`);
