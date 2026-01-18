#!/usr/bin/env node
/**
 * Split Notes.css into logical component files
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const INPUT = 'src/components/Notes/Notes.css';
const css = readFileSync(INPUT, 'utf-8');

const BASE = 'src/components/Notes';

// Mapping: selector patterns → output file (order matters - more specific first)
const ROUTES = [
  // NoteEditor - must be before note-card
  ['.note-editor', `${BASE}/NoteEditor.css`],

  // NoteCard - individual note cards
  ['.note-card', `${BASE}/NoteCard.css`],
  ['.note-title', `${BASE}/NoteCard.css`],
  ['.note-content', `${BASE}/NoteCard.css`],
  ['.note-actions', `${BASE}/NoteCard.css`],
  ['.note-labels', `${BASE}/NoteCard.css`],
  ['.note-meta', `${BASE}/NoteCard.css`],
  ['.note-pin', `${BASE}/NoteCard.css`],

  // LabelManager - label management UI
  ['.label-manager', `${BASE}/LabelManager.css`],

  // LabelChip - label chips/tags
  ['.label-chip', `${BASE}/LabelChip.css`],
  ['.label-color', `${BASE}/LabelChip.css`],
  ['.label-dot', `${BASE}/LabelChip.css`],

  // Checklist
  ['.checklist', `${BASE}/Checklist.css`],

  // NotesLayout - container, grid, header, fab
  ['.notes-', `${BASE}/NotesLayout.css`],
];

// Output buckets
const buckets = {};
const destinations = [...new Set(ROUTES.map(r => r[1]))];
for (const file of destinations) {
  buckets[file] = [];
}
buckets[`${BASE}/NotesMisc.css`] = [];

/**
 * Parse CSS into blocks
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

    blocks.push({ selector, body, fullBlock });
    i = j;
  }

  return blocks;
}

/**
 * Route a selector to the right file
 */
function routeSelector(selector) {
  const sel = selector.toLowerCase();

  for (const [pattern, file] of ROUTES) {
    if (sel.includes(pattern)) {
      return file;
    }
  }

  return `${BASE}/NotesMisc.css`;
}

/**
 * Handle @media blocks
 */
function processMediaBlock(block) {
  const innerBlocks = parseBlocks(block.body);

  if (innerBlocks.length === 0) {
    buckets[`${BASE}/NotesMisc.css`].push(block.fullBlock);
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

// Parse and route
const blocks = parseBlocks(css);
console.log(`Parsed ${blocks.length} top-level blocks from Notes.css`);

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

// Write files
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

// Create new Notes.css with imports
const imports = created
  .filter(f => f !== 'Notes.css')
  .map(f => `@import './${f}';`)
  .join('\n');

writeFileSync(`${BASE}/Notes.css`, `/* Notes component styles */\n${imports}\n`);
console.log(`\n✓ Updated Notes.css with ${created.length} imports`);
