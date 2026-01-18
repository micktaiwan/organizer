#!/usr/bin/env node
/**
 * Pet Agent Worker - Entry point
 * Handles stdio communication with the pet service
 */

import * as readline from 'readline';
import { log } from './logger.mjs';
import { userSessions, SESSION_TIMEOUT_MS, sessionCleanupInterval } from './session.mjs';
import { runQuery, setSendFunction } from './agent.mjs';

// =============================================================================
// STDIO COMMUNICATION
// =============================================================================

const rl = readline.createInterface({ input: process.stdin });

function send(message) {
  process.stdout.write(JSON.stringify(message) + '\n');
}

// Set send function for agent
setSendFunction(send);

// =============================================================================
// REQUEST QUEUE (serializes requests to prevent race conditions)
// =============================================================================

const requestQueue = [];
let isProcessing = false;

async function enqueueQuery(params) {
  return new Promise((resolve) => {
    requestQueue.push({ params, resolve });
    processNext();
  });
}

async function processNext() {
  if (isProcessing || requestQueue.length === 0) return;
  isProcessing = true;

  const { params, resolve } = requestQueue.shift();

  try {
    await runQuery(params);
  } finally {
    resolve();
    isProcessing = false;
    processNext();
  }
}

// =============================================================================
// MESSAGE HANDLER
// =============================================================================

rl.on('line', async (line) => {
  try {
    const msg = JSON.parse(line);

    switch (msg.type) {
      case 'prompt':
        await enqueueQuery(msg);
        break;
      case 'reset':
        if (msg.userId) {
          userSessions.delete(msg.userId);
          log('info', `[Session] Reset session for ${msg.userId}`);
        } else {
          userSessions.clear();
          log('info', '[Session] Reset all sessions');
        }
        send({ type: 'reset_done', requestId: msg.requestId });
        break;
      case 'ping':
        send({ type: 'pong' });
        break;
    }
  } catch (error) {
    send({ type: 'error', message: error.message });
  }
});

// =============================================================================
// SHUTDOWN HANDLERS
// =============================================================================

process.on('SIGTERM', () => {
  clearInterval(sessionCleanupInterval);
  log('info', '[Worker] Received SIGTERM, shutting down');
  process.exit(0);
});

process.on('SIGINT', () => {
  clearInterval(sessionCleanupInterval);
  log('info', '[Worker] Received SIGINT, shutting down');
  process.exit(0);
});

// Signal ready
send({ type: 'ready' });
