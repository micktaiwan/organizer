import { spawn, ChildProcess } from 'child_process';
import * as readline from 'readline';
import * as path from 'path';
import * as fs from 'fs';
import { getAnthropicApiKey, getOpenAIApiKey, getAgentModel } from '../config/agent.js';
import { storeFactMemory } from '../memory/index.js';
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
  type: 'ready' | 'text' | 'done' | 'error' | 'session' | 'pong' | 'reset_done' | 'log';
  text?: string;
  response?: string;
  expression?: Expression;
  memories?: FactMemoryInput[];
  message?: string;
  requestId?: string;
  sessionId?: string;
  inputTokens?: number;
  outputTokens?: number;
  // For log messages
  level?: 'info' | 'debug' | 'error' | 'warn';
  data?: unknown;
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
          OPENAI_API_KEY: getOpenAIApiKey(),
          AGENT_MODEL: getAgentModel(),
          QDRANT_URL: process.env.QDRANT_URL || 'http://qdrant:6333',
          MCP_URL: process.env.MCP_URL || 'http://localhost:3001/mcp',
          EKO_MCP_TOKEN: process.env.EKO_MCP_TOKEN || '',
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
    // Handle log messages (no requestId needed)
    if (msg.type === 'log') {
      const logData = msg.data ? ` ${JSON.stringify(msg.data)}` : '';
      switch (msg.level) {
        case 'error':
          console.error(msg.message + logData);
          break;
        case 'warn':
          console.warn(msg.message + logData);
          break;
        case 'debug':
          console.log(`[DEBUG] ${msg.message}${logData}`);
          break;
        default:
          console.log(msg.message + logData);
      }
      return;
    }

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

    // No pre-search: the agent now has tools to search memory itself (agentic loop)

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

      console.log(`[Agent] 📩 Received question, forwarding to worker`);
      this.sendToWorker({ type: 'prompt', prompt: question, requestId });
    });
  }

  async resetSession(): Promise<void> {
    if (!this.worker || !this.isReady) return;

    const requestId = `reset_${Date.now()}`;
    this.sendToWorker({ type: 'reset', requestId });
    this.sessionId = null;
    console.log('[Agent] Session reset');
  }

  async ping(): Promise<boolean> {
    try {
      await this.ensureWorker();
      // Worker is spawned and ready - that's enough for health check
      return this.isReady;
    } catch {
      return false;
    }
  }

  private async storeMemories(memories: FactMemoryInput[]): Promise<void> {
    console.log(`[Agent] 💾 Storing ${memories.length} memories from agent response`);
    for (const memory of memories) {
      try {
        await storeFactMemory(memory);
        console.log(`[Agent] ✅ Stored: "${memory.content.slice(0, 50)}..." (ttl: ${memory.ttl || 'permanent'})`);
      } catch (error) {
        console.error('[Agent] ❌ Failed to store memory:', error);
      }
    }
  }
}

export const agentService = new AgentService();
