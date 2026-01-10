import { Router, Response } from 'express';
import { z } from 'zod';
import { Label, Note } from '../models/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

const createLabelSchema = z.object({
  name: z.string().min(1).max(50).trim(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#808080'),
});

const updateLabelSchema = z.object({
  name: z.string().min(1).max(50).trim().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

// GET /labels - List all labels
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const labels = await Label.find().sort({ name: 1 });
    res.json({ labels });
  } catch (error) {
    console.error('Get labels error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /labels/:id - Get single label
router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const label = await Label.findById(req.params.id);

    if (!label) {
      res.status(404).json({ error: 'Label non trouvé' });
      return;
    }

    res.json({ label });
  } catch (error) {
    console.error('Get label error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /labels - Create label
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = createLabelSchema.parse(req.body);

    // Check if label name already exists
    const existing = await Label.findOne({ name: data.name });
    if (existing) {
      res.status(400).json({ error: 'Un label avec ce nom existe déjà' });
      return;
    }

    const label = new Label({
      name: data.name,
      color: data.color,
      createdBy: req.userId,
    });

    await label.save();

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to('notes').emit('label:created', { label });
    }

    res.status(201).json({ label });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Données invalides', details: error.errors });
      return;
    }
    console.error('Create label error:', error);
    res.status(500).json({ error: 'Erreur lors de la création' });
  }
});

// PUT /labels/:id - Update label
router.put('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = updateLabelSchema.parse(req.body);

    const label = await Label.findById(req.params.id);
    if (!label) {
      res.status(404).json({ error: 'Label non trouvé' });
      return;
    }

    // Check if new name conflicts
    if (data.name && data.name !== label.name) {
      const existing = await Label.findOne({ name: data.name });
      if (existing) {
        res.status(400).json({ error: 'Un label avec ce nom existe déjà' });
        return;
      }
    }

    if (data.name) label.name = data.name;
    if (data.color) label.color = data.color;

    await label.save();

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to('notes').emit('label:updated', { label });
    }

    res.json({ label });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Données invalides', details: error.errors });
      return;
    }
    console.error('Update label error:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour' });
  }
});

// DELETE /labels/:id - Delete label
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const label = await Label.findById(req.params.id);
    if (!label) {
      res.status(404).json({ error: 'Label non trouvé' });
      return;
    }

    // Remove label from all notes
    await Note.updateMany(
      { labels: req.params.id },
      { $pull: { labels: req.params.id } }
    );

    await Label.findByIdAndDelete(req.params.id);

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to('notes').emit('label:deleted', { labelId: req.params.id });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete label error:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
});

export default router;
