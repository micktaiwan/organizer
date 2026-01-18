#!/usr/bin/env node
/**
 * CSS Extractor - Splits App.css into component files by selector prefix
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const INPUT = 'src/App.css';
const css = readFileSync(INPUT, 'utf-8');

// Mapping: selector prefix → output file
const ROUTES = {
  // Chat - messages & bubbles
  '.chat-': 'src/components/Chat/Chat.css',
  '.message': 'src/components/Chat/Chat.css',
  '.bubble': 'src/components/Chat/Chat.css',
  '.timestamp': 'src/components/Chat/Chat.css',
  '.system-message': 'src/components/Chat/Chat.css',
  '.read-icon': 'src/components/Chat/Chat.css',
  '.sent-icon': 'src/components/Chat/Chat.css',

  // Chat - rooms & layout
  '.room-': 'src/components/Chat/Chat.css',

  // Chat - contacts & members
  '.contact': 'src/components/Chat/Chat.css',
  '.member-': 'src/components/Chat/Chat.css',
  '.sender-status': 'src/components/Chat/Chat.css',
  '.status-dot': 'src/components/Chat/Chat.css',

  // Chat - calls & video
  '.call': 'src/components/Chat/Chat.css',
  '.caller-': 'src/components/Chat/Chat.css',
  '.incoming-call': 'src/components/Chat/Chat.css',
  '.video-': 'src/components/Chat/Chat.css',
  '.local-video': 'src/components/Chat/Chat.css',
  '.remote-video': 'src/components/Chat/Chat.css',
  '.audio-': 'src/components/Chat/Chat.css',
  '.voice-btn': 'src/components/Chat/Chat.css',
  '.control-btn': 'src/components/Chat/Chat.css',
  '.end-call': 'src/components/Chat/Chat.css',
  '.accept-btn': 'src/components/Chat/Chat.css',
  '.reject-btn': 'src/components/Chat/Chat.css',

  // Chat - files & images
  '.image-': 'src/components/Chat/Chat.css',
  '.file-': 'src/components/Chat/Chat.css',
  '.pending-file': 'src/components/Chat/Chat.css',
  '.pending-image': 'src/components/Chat/Chat.css',
  '.cancel-file': 'src/components/Chat/Chat.css',
  '.cancel-image': 'src/components/Chat/Chat.css',
  '.attach-btn': 'src/components/Chat/Chat.css',

  // Chat - recording
  '.recording-': 'src/components/Chat/Chat.css',
  '.stop-recording': 'src/components/Chat/Chat.css',

  // Chat - misc
  '.typing-': 'src/components/Chat/Chat.css',
  '.unread-': 'src/components/Chat/Chat.css',
  '.emoji-': 'src/components/Chat/Chat.css',
  '.reaction': 'src/components/Chat/Chat.css',
  '.delete-': 'src/components/Chat/Chat.css',
  '.header-group': 'src/components/Chat/Chat.css',
  '.header-actions': 'src/components/Chat/Chat.css',

  // Auth
  '.auth-': 'src/components/Auth/AuthScreen.css',
  '.connection-': 'src/components/Auth/AuthScreen.css',
  '.connect-': 'src/components/Auth/AuthScreen.css',
  '.user-search': 'src/components/Auth/AuthScreen.css',
  '.login-': 'src/components/Auth/AuthScreen.css',
  '.register-': 'src/components/Auth/AuthScreen.css',
  '.peer-id': 'src/components/Auth/AuthScreen.css',
  '.username-section': 'src/components/Auth/AuthScreen.css',
  '.skip-': 'src/components/Auth/AuthScreen.css',
  '.container': 'src/components/Auth/AuthScreen.css',
  '.recent-user': 'src/components/Auth/AuthScreen.css',
  '.continue-btn': 'src/components/Auth/AuthScreen.css',

  // Notes
  '.notes-': 'src/components/Notes/Notes.css',
  '.note-': 'src/components/Notes/Notes.css',
  '.checklist-': 'src/components/Notes/Notes.css',
  '.label-': 'src/components/Notes/Notes.css',

  // Admin
  '.admin-': 'src/components/Admin/AdminPanel.css',
  '.user-item': 'src/components/Admin/AdminPanel.css',
  '.user-info': 'src/components/Admin/AdminPanel.css',
  '.user-details': 'src/components/Admin/AdminPanel.css',
  '.user-actions': 'src/components/Admin/AdminPanel.css',
  '.user-online-dot': 'src/components/Admin/AdminPanel.css',
  '.users-list': 'src/components/Admin/AdminPanel.css',
  '.toggle-admin': 'src/components/Admin/AdminPanel.css',
  '.stats-grid': 'src/components/Admin/AdminPanel.css',
  '.stat-': 'src/components/Admin/AdminPanel.css',
  '.pagination': 'src/components/Admin/AdminPanel.css',

  // Server Config
  '.server-': 'src/components/ServerConfig/ServerConfig.css',
  '.add-server-btn': 'src/components/ServerConfig/ServerConfig.css',
  '.form-group': 'src/components/ServerConfig/ServerConfig.css',
  '.close-btn': 'src/components/ServerConfig/ServerConfig.css',
  '.save-contact': 'src/components/ServerConfig/ServerConfig.css',
  '.add-contact': 'src/components/ServerConfig/ServerConfig.css',
  '.selected-badge': 'src/components/ServerConfig/ServerConfig.css',

  // UI Common
  '.btn': 'src/components/ui/common.css',
  '.badge': 'src/components/ui/common.css',
  '.modal': 'src/components/ui/common.css',
  '.loading': 'src/components/ui/common.css',
  '.spinner': 'src/components/ui/common.css',
  '.toast': 'src/components/ui/common.css',
  '.animate-spin': 'src/components/ui/common.css',
  '.client-icon': 'src/components/ui/common.css',
  '.settings-btn': 'src/components/ui/common.css',
};

// Output buckets
const buckets = {
  'src/App.css': [], // Keep core styles here
};

// Initialize buckets
for (const file of new Set(Object.values(ROUTES))) {
  buckets[file] = [];
}

/**
 * Parse CSS into blocks (handles nested braces correctly)
 */
function parseBlocks(css) {
  const blocks = [];
  let i = 0;

  while (i < css.length) {
    // Skip whitespace
    while (i < css.length && /\s/.test(css[i])) i++;
    if (i >= css.length) break;

    // Skip comments
    if (css.slice(i, i + 2) === '/*') {
      const end = css.indexOf('*/', i + 2);
      if (end === -1) break;
      i = end + 2;
      continue;
    }

    // Find the selector (everything before {)
    const openBrace = css.indexOf('{', i);
    if (openBrace === -1) break;

    const selector = css.slice(i, openBrace).trim();

    // Find matching closing brace (handle nesting)
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

  // Check each route
  for (const [prefix, file] of Object.entries(ROUTES)) {
    if (sel.includes(prefix)) {
      return file;
    }
  }

  // Default: keep in App.css
  return 'src/App.css';
}

/**
 * Handle @media blocks - need to split their contents
 */
function processMediaBlock(block) {
  const innerBlocks = parseBlocks(block.body);

  if (innerBlocks.length === 0) {
    // Empty or unparseable, keep in App.css
    buckets['src/App.css'].push(block.fullBlock);
    return;
  }

  // Group inner blocks by destination
  const mediaGroups = {};

  for (const inner of innerBlocks) {
    const dest = routeSelector(inner.selector);
    if (!mediaGroups[dest]) mediaGroups[dest] = [];
    mediaGroups[dest].push(inner.fullBlock);
  }

  // Create @media block for each destination
  for (const [dest, rules] of Object.entries(mediaGroups)) {
    const mediaBlock = `${block.selector} {\n${rules.join('\n\n')}\n}`;
    buckets[dest].push(mediaBlock);
  }
}

// Parse all blocks
const blocks = parseBlocks(css);

console.log(`Parsed ${blocks.length} top-level blocks`);

// Route each block
for (const block of blocks) {
  if (block.selector.startsWith('@media')) {
    processMediaBlock(block);
  } else if (block.selector.startsWith('@keyframes')) {
    // Route keyframes based on name
    const dest = routeSelector(block.selector);
    buckets[dest].push(block.fullBlock);
  } else if (block.selector === ':root') {
    // Keep :root in App.css
    buckets['src/App.css'].push(block.fullBlock);
  } else {
    const dest = routeSelector(block.selector);
    buckets[dest].push(block.fullBlock);
  }
}

// Write output files
for (const [file, rules] of Object.entries(buckets)) {
  if (rules.length === 0) continue;

  // Ensure directory exists
  mkdirSync(dirname(file), { recursive: true });

  const content = rules.join('\n\n') + '\n';
  writeFileSync(file, content);
  console.log(`✓ ${file}: ${rules.length} blocks, ${content.length} chars`);
}

// Create new App.css with imports at the TOP
const imports = Object.keys(buckets)
  .filter(f => f !== 'src/App.css' && buckets[f].length > 0)
  .map(f => `@import '${f.replace('src/', './')}';`)
  .join('\n');

const appCssContent = buckets['src/App.css'].join('\n\n');
const finalAppCss = `/* Component imports */\n${imports}\n\n/* Core styles */\n${appCssContent}\n`;

writeFileSync('src/App.css', finalAppCss);
console.log(`\n✓ Updated src/App.css with ${imports.split('\n').length} imports`);
