import { Router, Response } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { Note, Label } from '../models/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

const createNoteSchema = z.object({
  type: z.enum(['note', 'checklist']).default('note'),
  title: z.string().max(200).default(''),
  content: z.string().max(10000).default(''),
  items: z.array(z.object({
    text: z.string(),
  })).default([]),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#ffffff'),
  labels: z.array(z.string()).default([]),
  assignedTo: z.string().nullable().optional(),
});

const updateNoteSchema = z.object({
  type: z.enum(['note', 'checklist']).optional(),
  title: z.string().max(200).optional(),
  content: z.string().max(10000).optional(),
  items: z.array(z.object({
    _id: z.string().optional(),
    text: z.string(),
    checked: z.boolean().default(false),
    order: z.number(),
  })).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  labels: z.array(z.string()).optional(),
  assignedTo: z.string().nullable().optional(),
  isPinned: z.boolean().optional(),
  isArchived: z.boolean().optional(),
});

const reorderSchema = z.object({
  noteId: z.string(),
  newOrder: z.number(),
});

const updateChecklistItemSchema = z.object({
  text: z.string().optional(),
  checked: z.boolean().optional(),
});

const addChecklistItemSchema = z.object({
  text: z.string(),
});

const reorderItemsSchema = z.object({
  items: z.array(z.object({
    _id: z.string(),
    order: z.number(),
  })),
});

// Helper to populate note with labels and users (for queries)
const populateNoteQuery = (query: any) => {
  return query
    .populate('labels', 'name color')
    .populate('assignedTo', 'username displayName')
    .populate('createdBy', 'username displayName');
};

// Helper to populate a saved document
const populateNoteDoc = async (note: any) => {
  return note.populate([
    { path: 'labels', select: 'name color' },
    { path: 'assignedTo', select: 'username displayName' },
    { path: 'createdBy', select: 'username displayName' }
  ]);
};

// GET /notes - List all non-archived notes
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { labelId, archived } = req.query;

    const filter: any = {
      isArchived: archived === 'true',
    };

    if (labelId) {
      filter.labels = labelId;
    }

    const notes = await populateNoteQuery(
      Note.find(filter).sort({ isPinned: -1, order: 1 })
    );

    res.json({ notes });
  } catch (error) {
    console.error('Get notes error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /notes/:id - Get single note
router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const note = await populateNoteQuery(Note.findById(req.params.id));

    if (!note) {
      res.status(404).json({ error: 'Note non trouvée' });
      return;
    }

    res.json({ note });
  } catch (error) {
    console.error('Get note error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /notes - Create note
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = createNoteSchema.parse(req.body);

    // Convert items to include order
    const items = data.items.map((item, index) => ({
      text: item.text,
      checked: false,
      order: index,
    }));

    // Validate labels exist
    if (data.labels.length > 0) {
      const labelCount = await Label.countDocuments({
        _id: { $in: data.labels },
      });
      if (labelCount !== data.labels.length) {
        res.status(400).json({ error: 'Un ou plusieurs labels invalides' });
        return;
      }
    }

    const note = new Note({
      type: data.type,
      title: data.title,
      content: data.content,
      items,
      color: data.color,
      labels: data.labels,
      assignedTo: data.assignedTo || req.userId,
      createdBy: req.userId,
    });

    await note.save();
    await populateNoteDoc(note);

    // Emit socket event for real-time sync
    const io = req.app.get('io');
    if (io) {
      io.to('notes').emit('note:created', { note, createdBy: req.userId });
    }

    res.status(201).json({ note });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Données invalides', details: error.errors });
      return;
    }
    console.error('Create note error:', error);
    res.status(500).json({ error: 'Erreur lors de la création' });
  }
});

// PUT /notes/:id - Full update
router.put('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = updateNoteSchema.parse(req.body);

    const note = await Note.findById(req.params.id);
    if (!note) {
      res.status(404).json({ error: 'Note non trouvée' });
      return;
    }

    // Validate labels if provided
    if (data.labels && data.labels.length > 0) {
      const labelCount = await Label.countDocuments({
        _id: { $in: data.labels },
      });
      if (labelCount !== data.labels.length) {
        res.status(400).json({ error: 'Un ou plusieurs labels invalides' });
        return;
      }
    }

    Object.assign(note, data);
    await note.save();
    await populateNoteDoc(note);

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to('notes').emit('note:updated', { note, updatedBy: req.userId });
    }

    res.json({ note });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Données invalides', details: error.errors });
      return;
    }
    console.error('Update note error:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour' });
  }
});

// PATCH /notes/:id - Partial update
router.patch('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = updateNoteSchema.parse(req.body);

    const note = await Note.findById(req.params.id);
    if (!note) {
      res.status(404).json({ error: 'Note non trouvée' });
      return;
    }

    // Validate labels if provided
    if (data.labels && data.labels.length > 0) {
      const labelCount = await Label.countDocuments({
        _id: { $in: data.labels },
      });
      if (labelCount !== data.labels.length) {
        res.status(400).json({ error: 'Un ou plusieurs labels invalides' });
        return;
      }
    }

    Object.assign(note, data);
    await note.save();
    await populateNoteDoc(note);

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to('notes').emit('note:updated', { note, updatedBy: req.userId });
    }

    res.json({ note });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Données invalides', details: error.errors });
      return;
    }
    console.error('Patch note error:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour' });
  }
});

// DELETE /notes/:id - Delete note
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) {
      res.status(404).json({ error: 'Note non trouvée' });
      return;
    }

    await Note.findByIdAndDelete(req.params.id);

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to('notes').emit('note:deleted', { noteId: req.params.id, deletedBy: req.userId });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete note error:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
});

// POST /notes/reorder - Reorder note
router.post('/reorder', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = reorderSchema.parse(req.body);

    const note = await Note.findByIdAndUpdate(
      data.noteId,
      { order: data.newOrder },
      { new: true }
    );

    if (!note) {
      res.status(404).json({ error: 'Note non trouvée' });
      return;
    }

    await populateNoteDoc(note);

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to('notes').emit('note:updated', { note, updatedBy: req.userId });
    }

    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Données invalides', details: error.errors });
      return;
    }
    console.error('Reorder note error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /notes/:id/items - Add checklist item
router.post('/:id/items', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = addChecklistItemSchema.parse(req.body);

    const note = await Note.findById(req.params.id);
    if (!note) {
      res.status(404).json({ error: 'Note non trouvée' });
      return;
    }

    if (note.type !== 'checklist') {
      res.status(400).json({ error: 'Cette note n\'est pas une checklist' });
      return;
    }

    const maxOrder = note.items.reduce((max, item) => Math.max(max, item.order), -1);

    note.items.push({
      _id: new mongoose.Types.ObjectId(),
      text: data.text,
      checked: false,
      order: maxOrder + 1,
    });

    await note.save();
    await populateNoteDoc(note);

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to('notes').emit('note:updated', { note, updatedBy: req.userId });
    }

    res.json({ note });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Données invalides', details: error.errors });
      return;
    }
    console.error('Add item error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /notes/:id/items/:itemId - Update checklist item
router.patch('/:id/items/:itemId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = updateChecklistItemSchema.parse(req.body);

    const note = await Note.findById(req.params.id);
    if (!note) {
      res.status(404).json({ error: 'Note non trouvée' });
      return;
    }

    const item = note.items.find(i => i._id.toString() === req.params.itemId);
    if (!item) {
      res.status(404).json({ error: 'Item non trouvé' });
      return;
    }

    if (data.text !== undefined) item.text = data.text;
    if (data.checked !== undefined) item.checked = data.checked;

    await note.save();
    await populateNoteDoc(note);

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to('notes').emit('note:updated', { note, updatedBy: req.userId });
    }

    res.json({ note });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Données invalides', details: error.errors });
      return;
    }
    console.error('Update item error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /notes/:id/items/:itemId - Delete checklist item
router.delete('/:id/items/:itemId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) {
      res.status(404).json({ error: 'Note non trouvée' });
      return;
    }

    const itemIndex = note.items.findIndex(i => i._id.toString() === req.params.itemId);
    if (itemIndex === -1) {
      res.status(404).json({ error: 'Item non trouvé' });
      return;
    }

    note.items.splice(itemIndex, 1);
    await note.save();
    await populateNoteDoc(note);

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to('notes').emit('note:updated', { note, updatedBy: req.userId });
    }

    res.json({ note });
  } catch (error) {
    console.error('Delete item error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /notes/:id/items/reorder - Reorder checklist items
router.post('/:id/items/reorder', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = reorderItemsSchema.parse(req.body);

    const note = await Note.findById(req.params.id);
    if (!note) {
      res.status(404).json({ error: 'Note non trouvée' });
      return;
    }

    // Update order for each item
    for (const update of data.items) {
      const item = note.items.find(i => i._id.toString() === update._id);
      if (item) {
        item.order = update.order;
      }
    }

    await note.save();
    await populateNoteDoc(note);

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to('notes').emit('note:updated', { note, updatedBy: req.userId });
    }

    res.json({ note });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Données invalides', details: error.errors });
      return;
    }
    console.error('Reorder items error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
