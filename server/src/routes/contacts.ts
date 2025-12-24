import { Router, Response } from 'express';
import { z } from 'zod';
import { Contact, User } from '../models/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);

const addContactSchema = z.object({
  contactId: z.string(),
  nickname: z.string().max(50).optional(),
});

// GET /contacts - Liste des contacts
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const contacts = await Contact.find({ userId: req.userId })
      .populate('contactId', 'username displayName isOnline lastSeen peerId')
      .sort({ createdAt: -1 });

    res.json({
      contacts: contacts.map((c) => ({
        id: c._id,
        nickname: c.nickname,
        user: c.contactId,
        createdAt: c.createdAt,
      })),
    });
  } catch (error) {
    console.error('Get contacts error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des contacts' });
  }
});

// POST /contacts - Ajouter un contact
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = addContactSchema.parse(req.body);

    // Vérifier que l'utilisateur cible existe
    const targetUser = await User.findById(data.contactId);
    if (!targetUser) {
      res.status(404).json({ error: 'Utilisateur non trouvé' });
      return;
    }

    // Vérifier qu'on n'ajoute pas soi-même
    if (data.contactId === req.userId) {
      res.status(400).json({ error: 'Vous ne pouvez pas vous ajouter vous-même' });
      return;
    }

    // Vérifier si le contact existe déjà
    const existingContact = await Contact.findOne({
      userId: req.userId,
      contactId: data.contactId,
    });

    if (existingContact) {
      res.status(400).json({ error: 'Ce contact existe déjà' });
      return;
    }

    const contact = new Contact({
      userId: req.userId,
      contactId: data.contactId,
      nickname: data.nickname || null,
    });

    await contact.save();
    await contact.populate('contactId', 'username displayName isOnline lastSeen peerId');

    res.status(201).json({
      contact: {
        id: contact._id,
        nickname: contact.nickname,
        user: contact.contactId,
        createdAt: contact.createdAt,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Données invalides', details: error.errors });
      return;
    }
    console.error('Add contact error:', error);
    res.status(500).json({ error: 'Erreur lors de l\'ajout du contact' });
  }
});

// PATCH /contacts/:id - Mettre à jour un contact (nickname)
router.patch('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const contact = await Contact.findOne({
      _id: req.params.id,
      userId: req.userId,
    });

    if (!contact) {
      res.status(404).json({ error: 'Contact non trouvé' });
      return;
    }

    if (req.body.nickname !== undefined) {
      contact.nickname = req.body.nickname || null;
    }

    await contact.save();
    await contact.populate('contactId', 'username displayName isOnline lastSeen peerId');

    res.json({
      contact: {
        id: contact._id,
        nickname: contact.nickname,
        user: contact.contactId,
        createdAt: contact.createdAt,
      },
    });
  } catch (error) {
    console.error('Update contact error:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour' });
  }
});

// DELETE /contacts/:id - Supprimer un contact
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await Contact.deleteOne({
      _id: req.params.id,
      userId: req.userId,
    });

    if (result.deletedCount === 0) {
      res.status(404).json({ error: 'Contact non trouvé' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete contact error:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
});

export default router;
