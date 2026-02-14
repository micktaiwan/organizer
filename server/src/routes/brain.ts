import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import {
  listSelfWithIds,
  listGoalsWithIds,
  countSelf,
  countGoals,
  countFacts,
  deleteSelf,
  deleteGoal,
  listFacts,
  deleteFact,
  getLiveCollectionInfo,
  getAllLiveMessagesWithIds,
  clearLiveCollection,
  deleteLiveMessage,
} from '../memory/index.js';

const router = Router();

// GET /brain/counts - Get counts for all brain components
router.get('/counts', authMiddleware, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [selfCount, goalsCount, factsCount, liveInfo] = await Promise.all([
      countSelf(),
      countGoals(),
      countFacts(),
      getLiveCollectionInfo(),
    ]);

    res.json({
      self: selfCount,
      goals: goalsCount,
      facts: factsCount,
      live: liveInfo.pointsCount,
    });
  } catch (error) {
    console.error('[Brain] Counts error:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Erreur lors de la récupération des counts' });
  }
});

// GET /brain/self - Get all self items
router.get('/self', authMiddleware, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const items = await listSelfWithIds(100);
    res.json({ items });
  } catch (error) {
    console.error('[Brain] Self list error:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Erreur lors de la récupération des self items' });
  }
});

// GET /brain/goals - Get all goals
router.get('/goals', authMiddleware, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const items = await listGoalsWithIds(100);
    res.json({ items });
  } catch (error) {
    console.error('[Brain] Goals list error:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Erreur lors de la récupération des goals' });
  }
});

// GET /brain/facts - Get all facts
router.get('/facts', authMiddleware, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const items = await listFacts(100);
    res.json({ items });
  } catch (error) {
    console.error('[Brain] Facts list error:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Erreur lors de la récupération des facts' });
  }
});

// GET /brain/live - Get live buffer info and preview
router.get('/live', authMiddleware, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [info, messages] = await Promise.all([
      getLiveCollectionInfo(),
      getAllLiveMessagesWithIds(),
    ]);

    // Return last 10 messages as preview (already sorted by timestamp DESC)
    const preview = messages.slice(0, 10);

    res.json({
      count: info.pointsCount,
      preview: preview.map((m) => ({
        id: m.id,
        author: m.payload.author,
        content: m.payload.content.slice(0, 100) + (m.payload.content.length > 100 ? '...' : ''),
        type: m.payload.type || 'text',
        timestamp: m.payload.timestamp,
      })),
    });
  } catch (error) {
    console.error('[Brain] Live info error:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Erreur lors de la récupération du live buffer' });
  }
});

// DELETE /brain/live - Clear all live messages
router.delete('/live', authMiddleware, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const cleared = await clearLiveCollection();
    console.log(`[Brain] Cleared ${cleared} live messages`);
    res.json({ success: true, cleared });
  } catch (error) {
    console.error('[Brain] Live clear error:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Erreur lors de la suppression du live buffer' });
  }
});

// DELETE /brain/live/:id - Delete a single live message
router.delete('/live/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await deleteLiveMessage(id);
    console.log(`[Brain] Deleted live message: ${id}`);
    res.json({ success: true });
  } catch (error) {
    console.error('[Brain] Live message delete error:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Erreur lors de la suppression du message' });
  }
});

// DELETE /brain/self/:id - Delete a self item
router.delete('/self/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await deleteSelf(id);
    console.log(`[Brain] Deleted self item: ${id}`);
    res.json({ success: true });
  } catch (error) {
    console.error('[Brain] Self delete error:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
});

// DELETE /brain/goals/:id - Delete a goal
router.delete('/goals/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await deleteGoal(id);
    console.log(`[Brain] Deleted goal: ${id}`);
    res.json({ success: true });
  } catch (error) {
    console.error('[Brain] Goal delete error:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
});

// DELETE /brain/facts/:id - Delete a fact
router.delete('/facts/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await deleteFact(id);
    console.log(`[Brain] Deleted fact: ${id}`);
    res.json({ success: true });
  } catch (error) {
    console.error('[Brain] Fact delete error:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
});

export default router;
