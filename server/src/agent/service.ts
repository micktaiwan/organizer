import { spawn, ChildProcess } from 'child_process';
import * as readline from 'readline';
import * as path from 'path';
import * as fs from 'fs';
import { getAnthropicApiKey } from '../config/agent.js';
import { searchFacts, storeFactMemory } from '../memory/index.js';
import type { FactMemoryInput } from '../memory/index.js';
import type { Expression } from './types.js';

const isDev = () => {
  // Check if running with tsx (dev mode) vs compiled (prod mode)
  const distPath = path.join(process.cwd(), 'dist', 'agent', 'worker.mjs');
  return !fs.existsSync(distPath);
};

const getWorkerConfig = () => {
  if (isDev()) {
    // Dev mode: worker.mjs is already JS, run it directly
    const workerPath = path.join(process.cwd(), 'src', 'agent', 'worker.mjs');
    return { command: 'node', args: [workerPath] };
  } else {
    // Prod mode: run compiled JS
    const workerPath = path.join(process.cwd(), 'dist', 'agent', 'worker.mjs');
    return { command: 'node', args: [workerPath] };
  }
};

interface WorkerMessage {
  type: 'ready' | 'text' | 'done' | 'error' | 'session' | 'pong' | 'reset_done';
  text?: string;
  response?: string;
  expression?: Expression;
  memories?: FactMemoryInput[];
  message?: string;
  requestId?: string;
  sessionId?: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface AgentResponse {
  response: string;
  expression: Expression;
}

interface PendingRequest {
  resolve: (result: AgentResponse) => void;
  reject: (error: Error) => void;
  response: string;
  expression: Expression;
  timeout: NodeJS.Timeout;
}

export class AgentService {
  private worker: ChildProcess | null = null;
  private rl: readline.Interface | null = null;
  private isReady = false;
  private pendingRequests = new Map<string, PendingRequest>();
  private requestCounter = 0;
  private sessionId: string | null = null;

  private async ensureWorker(): Promise<void> {
    if (this.worker && this.isReady) {
      return;
    }

    return new Promise((resolve, reject) => {
      const { command, args } = getWorkerConfig();

      console.log(`[Agent] Starting worker (${isDev() ? 'dev' : 'prod'} mode)...`);

      this.worker = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          ANTHROPIC_API_KEY: getAnthropicApiKey(),
        },
      });

      this.rl = readline.createInterface({ input: this.worker.stdout! });

      this.rl.on('line', (line) => {
        try {
          const msg: WorkerMessage = JSON.parse(line);
          this.handleWorkerMessage(msg);

          if (msg.type === 'ready') {
            this.isReady = true;
            console.log('[Agent] Worker ready');
            resolve();
          }
        } catch (e) {
          console.error('[Agent] Failed to parse worker message:', line);
        }
      });

      this.worker.stderr?.on('data', (data) => {
        console.error('[Agent Worker stderr]', data.toString());
      });

      this.worker.on('error', (error) => {
        console.error('[Agent] Worker error:', error);
        this.cleanup();
        reject(error);
      });

      this.worker.on('exit', (code) => {
        console.log(`[Agent] Worker exited with code ${code}`);
        this.cleanup();
        // Reject any pending requests
        for (const [requestId, pending] of this.pendingRequests) {
          clearTimeout(pending.timeout);
          pending.reject(new Error('Worker exited'));
        }
        this.pendingRequests.clear();
      });

      // Timeout for initial ready
      setTimeout(() => {
        if (!this.isReady) {
          this.cleanup();
          reject(new Error('Worker startup timeout'));
        }
      }, 30000);
    });
  }

  private handleWorkerMessage(msg: WorkerMessage) {
    if (!msg.requestId) return;

    const pending = this.pendingRequests.get(msg.requestId);
    if (!pending) return;

    switch (msg.type) {
      case 'text':
        if (msg.text) {
          pending.response += msg.text;
        }
        break;

      case 'session':
        if (msg.sessionId) {
          this.sessionId = msg.sessionId;
          console.log(`[Agent] Session: ${this.sessionId}`);
        }
        break;

      case 'done':
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(msg.requestId);
        // Store memories asynchronously (don't block response)
        if (msg.memories && msg.memories.length > 0) {
          this.storeMemories(msg.memories);
        }
        pending.resolve({
          response: msg.response || pending.response.trim(),
          expression: msg.expression || pending.expression || 'neutral',
        });
        break;

      case 'error':
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(msg.requestId);
        pending.reject(new Error(msg.message || 'Worker error'));
        break;
    }
  }

  private cleanup() {
    this.isReady = false;
    this.sessionId = null;
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
    if (this.worker && !this.worker.killed) {
      this.worker.kill('SIGTERM');
    }
    this.worker = null;
  }

  private sendToWorker(message: object) {
    if (this.worker && this.worker.stdin) {
      this.worker.stdin.write(JSON.stringify(message) + '\n');
    }
  }

  async ask(question: string): Promise<AgentResponse> {
    await this.ensureWorker();

    const requestId = `req_${++this.requestCounter}_${Date.now()}`;

    // Search for relevant memories
    let promptWithMemories = question;
    try {
      const memories = await searchFacts(question, 5);
      if (memories.length > 0) {
        // Parse the original JSON to inject memories
        const parsed = JSON.parse(question);
        parsed.memories = memories.map((m) => ({
          content: m.payload.content,
          subjects: m.payload.subjects,
        }));
        promptWithMemories = JSON.stringify(parsed);
        console.log(`[Agent] Injected ${memories.length} memories`);
      }
    } catch (error) {
      // If parsing fails or search fails, just use original question
      console.warn('[Agent] Memory search failed:', error);
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Request timeout'));
      }, 2 * 60 * 1000); // 2 minutes

      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        response: '',
        expression: 'neutral',
        timeout,
      });

      console.log(`[Agent] User asked: "${question}"`);
      this.sendToWorker({ type: 'prompt', prompt: promptWithMemories, requestId });
    });
  }

  async resetSession(): Promise<void> {
    if (!this.worker || !this.isReady) return;

    const requestId = `reset_${Date.now()}`;
    this.sendToWorker({ type: 'reset', requestId });
    this.sessionId = null;
    console.log('[Agent] Session reset');
  }

  private async storeMemories(memories: FactMemoryInput[]): Promise<void> {
    for (const memory of memories) {
      try {
        await storeFactMemory(memory);
      } catch (error) {
        console.error('[Agent] Failed to store memory:', error);
      }
    }
  }
}

export const agentService = new AgentService();
