import { Router, Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { Room, Message } from '../models/index.js';

const router = Router();
router.use(authMiddleware);

// Constants
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB original
const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 80;
const MAX_OUTPUT_SIZE = 2 * 1024 * 1024; // 2MB output
const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'images');

// Multer configuration (memory storage for processing)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Format non supporté. Utilisez JPEG, PNG, WebP, HEIC ou GIF'));
    }
  }
});

// Helper: Generate date-based path
function getDatePath(): { folder: string; relativePath: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const folder = path.join(UPLOAD_DIR, String(year), month);
  const relativePath = `/uploads/images/${year}/${month}`;

  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }

  return { folder, relativePath };
}

// Helper: Process image with Sharp
async function processImage(buffer: Buffer, mimeType: string): Promise<{
  processedBuffer: Buffer;
  metadata: { width: number; height: number; format: string; size: number };
  extension: string;
}> {
  // Get original metadata
  const image = sharp(buffer);
  const metadata = await image.metadata();

  // Resize if needed
  let processor = image;
  if (metadata.width && metadata.height) {
    if (metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION) {
      processor = processor.resize(MAX_DIMENSION, MAX_DIMENSION, {
        fit: 'inside',
        withoutEnlargement: true
      });
    }
  }

  // Compress based on original format
  let processedBuffer: Buffer;
  let format: string;
  let extension: string;

  if (mimeType === 'image/png') {
    // Preserve PNG format (good for transparency)
    processedBuffer = await processor
      .png({ quality: 80, compressionLevel: 9 })
      .toBuffer();
    format = 'png';
    extension = 'png';
  } else if (mimeType === 'image/webp') {
    // Preserve WebP format
    processedBuffer = await processor
      .webp({ quality: JPEG_QUALITY })
      .toBuffer();
    format = 'webp';
    extension = 'webp';
  } else {
    // Convert to JPEG (JPEG, HEIC, GIF, or unknown)
    processedBuffer = await processor
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();
    format = 'jpeg';
    extension = 'jpg';
  }

  // Check output size
  if (processedBuffer.length > MAX_OUTPUT_SIZE) {
    throw new Error('Image trop volumineuse après compression (max 2MB)');
  }

  // Get final metadata
  const finalMetadata = await sharp(processedBuffer).metadata();

  return {
    processedBuffer,
    metadata: {
      width: finalMetadata.width || 0,
      height: finalMetadata.height || 0,
      format,
      size: processedBuffer.length
    },
    extension
  };
}

// POST /upload/image
router.post('/image', upload.single('image'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Aucune image fournie' });
      return;
    }

    const { roomId, caption } = req.body;

    if (!roomId) {
      res.status(400).json({ error: 'roomId est requis' });
      return;
    }

    // Verify user is member of room
    const room = await Room.findById(roomId);
    if (!room) {
      res.status(404).json({ error: 'Salon non trouvé' });
      return;
    }

    const isMember = room.members.some(m => m.userId.toString() === req.userId);
    const isPublic = room.type === 'public' || room.type === 'lobby';

    if (!isMember && !isPublic) {
      res.status(403).json({ error: 'Accès non autorisé à ce salon' });
      return;
    }

    // Process image
    const { processedBuffer, metadata, extension } = await processImage(req.file.buffer, req.file.mimetype);

    // Generate filename and path
    const { folder, relativePath } = getDatePath();
    const filename = `${crypto.randomUUID()}.${extension}`;
    const filePath = path.join(folder, filename);
    const urlPath = `${relativePath}/${filename}`;

    // Write to disk
    fs.writeFileSync(filePath, processedBuffer);

    console.log(`✓ Image uploaded: ${urlPath} (${metadata.size} bytes, ${metadata.width}x${metadata.height})`);

    // Create message in database
    const message = await Message.create({
      roomId,
      senderId: req.userId,
      type: 'image',
      content: urlPath, // Store relative path
      caption: caption || undefined,
      status: 'sent',
      readBy: [req.userId]
    });

    // Populate sender info
    await message.populate('senderId', 'username displayName isOnline status statusMessage');

    // Return message (format expected by client)
    res.status(201).json({
      message
    });
  } catch (error) {
    console.error('Image upload error:', error);
    const message = error instanceof Error ? error.message : 'Erreur lors du téléchargement';
    res.status(400).json({ error: message });
  }
});

export default router;
