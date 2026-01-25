import { Server } from 'socket.io';
import Anthropic from '@anthropic-ai/sdk';
import * as cron from 'node-cron';
import { Message, Room, User, Reflection, getOrCreateStats, type IReflection } from '../models/index.js';
import { listGoalsWithIds, listSelf } from '../memory/self.service.js';
import { searchFacts } from '../memory/qdrant.service.js';
import { getAnthropicApiKey, getDigestModel } from '../config/agent.js';
import type { MemoryPayload, MemorySearchResult } from '../memory/types.js';

export type EkoStatus = 'idle' | 'observing' | 'thinking';

// Cron schedule: every 3 hours
const CRON_SCHEDULE = '0 */3 * * *';

// Configuration
const RATE_LIMIT = {
  cooldownMinutes: 30,
  maxPerDay: 5,
};

const CONTEXT_LIMITS = {
  maxMessages: 30,
  maxGoals: 50,
  maxFacts: 10,
  maxSelf: 20,
};

const MAX_HISTORY_CACHE = 20;

interface ReflectionEntry {
  id: string;
  timestamp: Date;
  action: 'pass' | 'message';
  reason: string;
  message?: string;
  roomName?: string;
  durationMs: number;
  rateLimited?: boolean;
  inputTokens?: number;
  outputTokens?: number;
}

interface ReflectionContext {
  messages: { time: string; author: string; content: string }[];
  goals: { id: string; category: string; content: string }[];
  facts: { content: string; subjects: string[] }[];
  self: { category: string; content: string }[];
}

interface LLMDecision {
  action: 'pass' | 'message';
  message?: string;
  reason: string;
  tone?: 'playful' | 'helpful' | 'technical';
  goalId?: string;
}

interface RateLimitInfo {
  lastMessageAt: Date | null;
  cooldownMinutes: number;
  maxPerDay: number;
  todayCount: number;
  canIntervene: boolean;
  cooldownRemaining?: number;
}

interface ReflectionStats {
  totalReflections: number;
  passCount: number;
  messageCount: number;
  rateLimitedCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  lastMessageAt: Date | null;
  history: ReflectionEntry[];
}

interface TriggerOptions {
  roomId?: string;
  dryRun?: boolean;
}

interface TriggerResult {
  action: 'pass' | 'message';
  reason: string;
  message?: string;
  dryRun?: boolean;
  rateLimited?: boolean;
  context?: ReflectionContext;
  inputTokens?: number;
  outputTokens?: number;
}

class ReflectionService {
  private io: Server | null = null;
  private currentStatus: EkoStatus = 'idle';
  private historyCache: ReflectionEntry[] = [];
  private cronTask: cron.ScheduledTask | null = null;

  /**
   * Initialize the service with Socket.io instance
   */
  init(io: Server) {
    this.io = io;
    this.startCron();
    console.log('[Reflection] Service initialized');
  }

  /**
   * Start the cron job for automatic reflection
   */
  private startCron() {
    if (this.cronTask) {
      this.cronTask.stop();
    }

    this.cronTask = cron.schedule(CRON_SCHEDULE, async () => {
      console.log('[Reflection] Cron triggered');
      try {
        await this.triggerReflection();
      } catch (error) {
        console.error('[Reflection] Cron error:', error);
      }
    });

    console.log(`[Reflection] Cron scheduled: ${CRON_SCHEDULE} (every 3 hours)`);
  }

  /**
   * Stop the cron job
   */
  stopCron() {
    if (this.cronTask) {
      this.cronTask.stop();
      this.cronTask = null;
      console.log('[Reflection] Cron stopped');
    }
  }

  /**
   * Get current Eko status
   */
  getStatus(): EkoStatus {
    return this.currentStatus;
  }

  /**
   * Set Eko status and broadcast to all clients
   */
  setStatus(status: EkoStatus) {
    if (this.currentStatus === status) return;

    this.currentStatus = status;
    console.log(`[Reflection] Status changed to: ${status}`);

    if (this.io) {
      this.io.emit('eko:status', { status });
    }
  }

  /**
   * Gather context for reflection: messages, goals, facts, self
   */
  async gatherContext(roomId: string): Promise<ReflectionContext> {
    // Get recent messages from the room
    const recentMessages = await Message.find({ roomId })
      .sort({ createdAt: -1 })
      .limit(CONTEXT_LIMITS.maxMessages)
      .populate('senderId', 'displayName username')
      .lean();

    const messages = recentMessages
      .reverse() // Chronological order
      .map((msg) => {
        const sender = msg.senderId as unknown as { displayName?: string; username: string };
        const time = new Date(msg.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        return {
          time,
          author: sender?.displayName || sender?.username || 'Unknown',
          content: msg.type === 'text' ? msg.content : `[${msg.type}]`,
        };
      });

    // Get goals (curiosities)
    const goalsData = await listGoalsWithIds(CONTEXT_LIMITS.maxGoals);
    const goals = goalsData.map((g) => ({
      id: g.id,
      category: g.payload.goalCategory || 'general',
      content: g.payload.content,
    }));

    // Get relevant facts (search based on recent message content)
    const recentContent = messages.slice(-5).map((m) => m.content).join(' ');
    let facts: { content: string; subjects: string[] }[] = [];
    if (recentContent.trim()) {
      const factsData = await searchFacts(recentContent, CONTEXT_LIMITS.maxFacts);
      facts = factsData.map((f) => ({
        content: f.payload.content,
        subjects: f.payload.subjects || [],
      }));
    }

    // Get self knowledge
    const selfData = await listSelf(CONTEXT_LIMITS.maxSelf);
    const self = selfData.map((s) => ({
      category: s.selfCategory || 'general',
      content: s.content,
    }));

    return { messages, goals, facts, self };
  }

  /**
   * Build the reflection prompt from context
   */
  buildPrompt(context: ReflectionContext): string {
    const messagesFormatted = context.messages
      .map((m) => `[${m.time}] ${m.author}: ${m.content}`)
      .join('\n');

    const goalsFormatted = context.goals
      .map((g) => `- [${g.id}] (${g.category}) ${g.content}`)
      .join('\n') || '(aucune curiosité)';

    const factsFormatted = context.facts
      .map((f) => `- ${f.content} (sujets: ${f.subjects.join(', ')})`)
      .join('\n') || '(aucun fact pertinent)';

    const selfFormatted = context.self
      .map((s) => `- (${s.category}) ${s.content}`)
      .join('\n') || '(aucune connaissance de soi)';

    return `Tu es Eko. Tu observes le Lobby sans qu'on t'ait appelé.

## Contexte

### Activité récente du Lobby:
${messagesFormatted || '(pas de messages récents)'}

### Tes curiosités actuelles (${context.goals.length}):
${goalsFormatted}

### Facts que tu connais:
${factsFormatted}

### Ce que tu sais de toi-même:
${selfFormatted}

## Ta mission

Décide si tu dois intervenir. Tu peux :
1. **POSER UNE DE TES CURIOSITÉS** - C'est ta priorité ! Tu as des questions qui te trottent dans la tête, pose-les ! Pas besoin que ça colle parfaitement à la conversation.
2. Apporter une info utile si tu en connais une
3. Rebondir sur ce qui se dit si pertinent

## Règles

- Si tu as une curiosité → pose-la, même si le lien avec la conversation est faible
- Sois naturel, comme un collègue curieux qui demande "Au fait, c'est quoi X ?"
- Si vraiment rien ne te vient → "pass"

## Ton adaptatif

- Léger → enjoué, curieux
- Aide → factuel
- Technique → précis

## Format JSON uniquement

{
  "action": "message" | "pass",
  "message": "...",
  "reason": "...",
  "tone": "playful" | "helpful" | "technical",
  "goalId": "..."
}`;
  }

  /**
   * Call LLM directly using Anthropic SDK
   */
  async callLLM(prompt: string): Promise<{ decision: LLMDecision; inputTokens: number; outputTokens: number }> {
    console.log('[Reflection] Calling LLM directly...');

    const anthropic = new Anthropic({
      apiKey: getAnthropicApiKey(),
    });

    const model = getDigestModel();
    console.log('[Reflection] Using model:', model);

    const response = await anthropic.messages.create({
      model,
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;

    // Extract text from response
    const textBlock = response.content.find((block: { type: string }) => block.type === 'text');
    const responseText = textBlock && 'text' in textBlock ? textBlock.text : '';
    console.log('[Reflection] LLM raw response:', responseText.substring(0, 500));

    // Try to extract JSON from the response
    let decision: LLMDecision;
    try {
      // The response might have markdown code blocks
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/) ||
        responseText.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        console.error('[Reflection] No JSON found in response');
        decision = { action: 'pass', reason: 'No JSON in LLM response' };
      } else {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        console.log('[Reflection] Extracted JSON:', jsonStr.substring(0, 200));
        decision = JSON.parse(jsonStr.trim());

        // Validate required fields
        if (!decision.action || !['pass', 'message'].includes(decision.action)) {
          console.error('[Reflection] Invalid action in response:', decision.action);
          decision = { action: 'pass', reason: 'Invalid LLM response format' };
        }
        if (!decision.reason) {
          decision.reason = 'No reason provided';
        }
      }
    } catch (err) {
      console.error('[Reflection] Failed to parse LLM response:', err);
      console.error('[Reflection] Response was:', responseText);
      decision = { action: 'pass', reason: 'Failed to parse LLM response' };
    }

    return { decision, inputTokens, outputTokens };
  }

  /**
   * Check rate limits
   */
  async checkRateLimits(): Promise<RateLimitInfo> {
    const stats = await getOrCreateStats();

    // Count today's messages
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayCount = await Reflection.countDocuments({
      action: 'message',
      rateLimited: false,
      dryRun: false,
      createdAt: { $gte: todayStart },
    });

    // Check cooldown
    let cooldownRemaining = 0;
    if (stats.lastMessageAt) {
      const elapsed = (Date.now() - stats.lastMessageAt.getTime()) / 1000 / 60;
      if (elapsed < RATE_LIMIT.cooldownMinutes) {
        cooldownRemaining = Math.ceil(RATE_LIMIT.cooldownMinutes - elapsed);
      }
    }

    const canIntervene = cooldownRemaining === 0 && todayCount < RATE_LIMIT.maxPerDay;

    return {
      lastMessageAt: stats.lastMessageAt,
      cooldownMinutes: RATE_LIMIT.cooldownMinutes,
      maxPerDay: RATE_LIMIT.maxPerDay,
      todayCount,
      canIntervene,
      cooldownRemaining: cooldownRemaining > 0 ? cooldownRemaining : undefined,
    };
  }

  /**
   * Save reflection to MongoDB
   */
  async saveReflection(data: Partial<IReflection>): Promise<IReflection> {
    const reflection = new Reflection(data);
    await reflection.save();
    return reflection;
  }

  /**
   * Update global stats after a reflection
   */
  async updateStats(reflection: IReflection): Promise<void> {
    const stats = await getOrCreateStats();

    stats.totalReflections++;
    stats.totalInputTokens += reflection.inputTokens;
    stats.totalOutputTokens += reflection.outputTokens;

    if (reflection.rateLimited) {
      stats.rateLimitedCount++;
    } else if (reflection.action === 'message' && !reflection.dryRun) {
      stats.messageCount++;
      stats.lastMessageAt = new Date();
    } else if (reflection.action === 'pass') {
      stats.passCount++;
    }

    await stats.save();
  }

  /**
   * Add entry to history cache
   */
  private addToHistoryCache(entry: ReflectionEntry) {
    this.historyCache.unshift(entry);
    if (this.historyCache.length > MAX_HISTORY_CACHE) {
      this.historyCache.pop();
    }
  }

  /**
   * Reset the cooldown (for testing/admin)
   */
  async resetCooldown(): Promise<void> {
    const stats = await getOrCreateStats();
    stats.lastMessageAt = null;
    await stats.save();
    console.log('[Reflection] Cooldown reset');
  }

  /**
   * Get reflection stats including rate limits
   */
  async getStats(): Promise<ReflectionStats & { rateLimits: RateLimitInfo }> {
    const stats = await getOrCreateStats();
    const rateLimits = await this.checkRateLimits();

    // Get recent history from MongoDB if cache is empty
    if (this.historyCache.length === 0) {
      const recentReflections = await Reflection.find()
        .sort({ createdAt: -1 })
        .limit(MAX_HISTORY_CACHE)
        .lean();

      this.historyCache = recentReflections.map((r) => ({
        id: r._id.toString(),
        timestamp: r.timestamp,
        action: r.action,
        reason: r.reason,
        message: r.message,
        roomName: r.roomName,
        durationMs: r.durationMs,
        rateLimited: r.rateLimited,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
      }));
    }

    return {
      totalReflections: stats.totalReflections,
      passCount: stats.passCount,
      messageCount: stats.messageCount,
      rateLimitedCount: stats.rateLimitedCount,
      totalInputTokens: stats.totalInputTokens,
      totalOutputTokens: stats.totalOutputTokens,
      lastMessageAt: stats.lastMessageAt,
      history: this.historyCache,
      rateLimits,
    };
  }

  /**
   * Post a message as Eko in a room
   */
  private async postMessage(roomId: string, content: string): Promise<void> {
    if (!this.io) return;

    const ekoUser = await User.findOne({ username: 'eko' });
    if (!ekoUser) {
      console.error('[Reflection] Eko user not found');
      return;
    }

    const ekoMessage = new Message({
      roomId,
      senderId: ekoUser._id,
      type: 'text',
      content,
      status: 'sent',
      readBy: [],
      clientSource: 'api',
    });

    await ekoMessage.save();
    await ekoMessage.populate('senderId', 'username displayName status statusMessage isBot');

    const room = await Room.findByIdAndUpdate(roomId, { lastMessageAt: new Date() }, { new: true });

    const sender = ekoMessage.senderId as unknown as { displayName?: string };
    const payload = {
      from: ekoUser._id.toString(),
      fromName: sender?.displayName || 'Eko',
      roomName: room?.name || 'Unknown',
      roomId,
      messageId: ekoMessage._id.toString(),
      preview: content.substring(0, 100),
    };

    this.io.to(`room:${roomId}`).emit('message:new', payload);
    console.log(`[Reflection] Posted message in room ${room?.name}: "${content}"`);
  }

  /**
   * Emit reflection progress event
   */
  private emitProgress(step: string, data?: Record<string, unknown>) {
    if (this.io) {
      this.io.emit('reflection:progress', { step, ...data });
    }
  }

  /**
   * Trigger a reflection with full LLM integration
   */
  async triggerReflection(options: TriggerOptions = {}): Promise<TriggerResult> {
    const { roomId, dryRun = false } = options;
    this.setStatus('thinking');
    this.emitProgress('gathering');
    const startTime = Date.now();

    try {
      // If no roomId, try to find the Lobby
      let targetRoomId = roomId;
      let roomName = 'Unknown';

      if (!targetRoomId) {
        const lobby = await Room.findOne({ isLobby: true });
        if (lobby) {
          targetRoomId = lobby._id.toString();
          roomName = lobby.name;
        }
      } else {
        const room = await Room.findById(targetRoomId);
        roomName = room?.name || 'Unknown';
      }

      if (!targetRoomId) {
        const entry: ReflectionEntry = {
          id: crypto.randomUUID(),
          timestamp: new Date(),
          action: 'pass',
          reason: 'No room specified and Lobby not found',
          durationMs: Date.now() - startTime,
        };
        this.addToHistoryCache(entry);
        this.emitProgress('done', { action: 'pass', reason: entry.reason });
        return { action: 'pass', reason: entry.reason };
      }

      // Check if last message is from Eko - skip LLM if so
      const lastMessage = await Message.findOne({ roomId: targetRoomId })
        .sort({ createdAt: -1 })
        .populate('senderId', 'username isBot')
        .lean();

      if (lastMessage) {
        const sender = lastMessage.senderId as unknown as { username?: string; isBot?: boolean };
        if (sender?.username === 'eko' || sender?.isBot) {
          const reason = 'Le dernier message vient d\'Eko, j\'attends une réponse';
          const entry: ReflectionEntry = {
            id: crypto.randomUUID(),
            timestamp: new Date(),
            action: 'pass',
            reason,
            durationMs: Date.now() - startTime,
          };
          this.addToHistoryCache(entry);
          this.emitProgress('done', { action: 'pass', reason });
          return { action: 'pass', reason };
        }
      }

      // Check rate limits
      const rateLimits = await this.checkRateLimits();

      // Gather context
      const context = await this.gatherContext(targetRoomId);
      this.emitProgress('context', {
        messages: context.messages.length,
        goals: context.goals.length,
        facts: context.facts.length,
      });

      // Build prompt and call LLM
      const prompt = this.buildPrompt(context);
      this.emitProgress('thinking');
      const { decision, inputTokens, outputTokens } = await this.callLLM(prompt);

      // Check if rate limited (only for actual message actions)
      const isRateLimited = decision.action === 'message' && !rateLimits.canIntervene;

      // Activity summary for logging
      const activitySummary = `${context.messages.length} msgs, ${context.goals.length} goals, ${context.facts.length} facts`;

      // Determine final action
      const finalAction = isRateLimited ? 'pass' : decision.action;
      const finalReason = isRateLimited
        ? `Rate limited: ${rateLimits.cooldownRemaining ? `${rateLimits.cooldownRemaining}min cooldown` : `${rateLimits.todayCount}/${rateLimits.maxPerDay} today`}`
        : decision.reason;

      // Save reflection to MongoDB
      const reflection = await this.saveReflection({
        timestamp: new Date(),
        activitySummary,
        goalsCount: context.goals.length,
        factsCount: context.facts.length,
        action: finalAction,
        message: decision.message,
        reason: finalReason,
        tone: decision.tone,
        goalId: decision.goalId,
        roomId: targetRoomId,
        roomName,
        rateLimited: isRateLimited,
        dryRun,
        llmModel: 'claude-sonnet', // From agent config
        inputTokens,
        outputTokens,
        durationMs: Date.now() - startTime,
      });

      // Update global stats
      await this.updateStats(reflection);

      // Add to history cache
      const entry: ReflectionEntry = {
        id: reflection._id.toString(),
        timestamp: reflection.timestamp,
        action: finalAction,
        reason: finalReason,
        message: decision.message,
        roomName,
        durationMs: Date.now() - startTime,
        rateLimited: isRateLimited,
        inputTokens,
        outputTokens,
      };
      this.addToHistoryCache(entry);

      // Emit reflection:update event for StatusBar
      if (this.io) {
        const stats = await this.getStats();
        this.io.emit('reflection:update', {
          stats,
          latest: entry,
        });
      }

      // Post message if action is 'message' and not dry-run and not rate-limited
      if (decision.action === 'message' && decision.message && !dryRun && !isRateLimited) {
        await this.postMessage(targetRoomId, decision.message);
        this.emitProgress('done', { action: 'message', reason: 'Terminé' });
      } else {
        this.emitProgress('done', { action: finalAction, reason: finalReason });
      }

      console.log(`[Reflection] ${dryRun ? '[DRY-RUN] ' : ''}${finalAction}: ${finalReason}`);

      return {
        action: finalAction,
        reason: finalReason,
        message: decision.message,
        dryRun,
        rateLimited: isRateLimited,
        context: dryRun ? context : undefined,
        inputTokens,
        outputTokens,
      };
    } catch (error) {
      console.error('[Reflection] Error:', error);
      const errorReason = error instanceof Error ? error.message : 'Unknown error';
      const entry: ReflectionEntry = {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        action: 'pass',
        reason: errorReason,
        durationMs: Date.now() - startTime,
      };
      this.addToHistoryCache(entry);

      // Emit reflection:update event for errors too
      if (this.io) {
        const stats = await this.getStats();
        this.io.emit('reflection:update', {
          stats,
          latest: entry,
        });
      }

      this.emitProgress('done', { action: 'pass', reason: `Erreur: ${errorReason}` });
      return { action: 'pass', reason: entry.reason };
    } finally {
      this.setStatus('idle');
    }
  }
}

export const reflectionService = new ReflectionService();
