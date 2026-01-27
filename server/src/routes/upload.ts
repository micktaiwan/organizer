import { Router, Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { Room, Message } from '../models/index.js';
import { emitNewMessage } from '../utils/socketEmit.js';
import { queueThumbnailJob } from '../jobs/generateThumbnail.js';

const router = Router();
router.use(authMiddleware);

// Constants for images
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB original
const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 80;
const MAX_OUTPUT_SIZE = 2 * 1024 * 1024; // 2MB output
const IMAGE_UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'images');

// Constants for files
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB for files
const FILE_UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'files');

// Constants for videos
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB for videos
const VIDEO_UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'videos');

// Multer configuration for images (memory storage for processing)
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Format non supporté. Utilisez JPEG, PNG, WebP, HEIC ou GIF'));
    }
  }
});

// Helper: Generate date-based path for images
function getImageDatePath(): { folder: string; relativePath: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const folder = path.join(IMAGE_UPLOAD_DIR, String(year), month);
  const relativePath = `/uploads/images/${year}/${month}`;

  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }

  return { folder, relativePath };
}

// Helper: Generate date-based path for files
function getFileDatePath(): { folder: string; relativePath: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const folder = path.join(FILE_UPLOAD_DIR, String(year), month);
  const relativePath = `/uploads/files/${year}/${month}`;

  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }

  return { folder, relativePath };
}

// Helper: Generate date-based path for videos
function getVideoDatePath(): { folder: string; relativePath: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const folder = path.join(VIDEO_UPLOAD_DIR, String(year), month);
  const relativePath = `/uploads/videos/${year}/${month}`;

  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }

  return { folder, relativePath };
}

// Multer configuration for files (disk storage)
const fileUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const { folder } = getFileDatePath();
      cb(null, folder);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      const filename = `${crypto.randomUUID()}${ext}`;
      cb(null, filename);
    }
  }),
  limits: { fileSize: MAX_FILE_SIZE }
});

// Multer configuration for videos (disk storage)
const videoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const { folder } = getVideoDatePath();
      cb(null, folder);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '.webm';
      const filename = `${crypto.randomUUID()}${ext}`;
      cb(null, filename);
    }
  }),
  limits: { fileSize: MAX_VIDEO_SIZE },
  fileFilter: (_req, file, cb) => {
    const allowed = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Format vidéo non supporté. Utilisez MP4 ou WebM'));
    }
  }
});

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
router.post('/image', imageUpload.single('image'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Aucune image fournie' });
      return;
    }

    const { roomId, caption, clientSource } = req.body;

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
    const { folder, relativePath } = getImageDatePath();
    const filename = `${crypto.randomUUID()}.${extension}`;
    const filePath = path.join(folder, filename);
    const urlPath = `${relativePath}/${filename}`;

    // Write to disk
    fs.writeFileSync(filePath, processedBuffer);

    console.log(`✓ Image uploaded: ${urlPath} (${metadata.size} bytes, ${metadata.width}x${metadata.height})`);

    // Create message in database
    const message = await Message.create({
      roomId,
      senderId: req.userId!,
      type: 'image',
      content: urlPath, // Store relative path
      caption: caption || undefined,
      status: 'sent',
      readBy: [req.userId!],
      clientSource: clientSource || undefined,
    });

    // Populate sender info
    await message.populate('senderId', 'username displayName isOnline status statusMessage');

    // Update room's lastMessageAt for sorting
    await Room.findByIdAndUpdate(roomId, { lastMessageAt: new Date() });

    // Emit socket event so connected clients receive the message
    const io = req.app.get('io');
    if (io) {
      await emitNewMessage({
        io,
        roomId,
        userId: req.userId!,
        message: message as any,
      });
    }

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

// POST /upload/file
router.post('/file', fileUpload.single('file'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Aucun fichier fourni' });
      return;
    }

    const { roomId, caption, clientSource } = req.body;

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

    const { relativePath } = getFileDatePath();
    const urlPath = `${relativePath}/${req.file.filename}`;

    console.log(`✓ File uploaded: ${urlPath} (${req.file.size} bytes, ${req.file.mimetype})`);

    // Create message in database
    const message = await Message.create({
      roomId,
      senderId: req.userId!,
      type: 'file',
      content: urlPath,
      caption: caption || undefined,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      status: 'sent',
      readBy: [req.userId!],
      clientSource: clientSource || undefined,
    });

    // Populate sender info
    await message.populate('senderId', 'username displayName isOnline status statusMessage');

    // Return message (format expected by client)
    res.status(201).json({
      message
    });
  } catch (error) {
    console.error('File upload error:', error);
    const message = error instanceof Error ? error.message : 'Erreur lors du téléchargement';
    res.status(400).json({ error: message });
  }
});

// POST /upload/video
router.post('/video', videoUpload.single('video'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Aucune vidéo fournie' });
      return;
    }

    const { roomId, caption, clientSource } = req.body;

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

    const { relativePath } = getVideoDatePath();
    const urlPath = `${relativePath}/${req.file.filename}`;
    const absolutePath = path.join(process.cwd(), 'public', urlPath);

    console.log(`✓ Video uploaded: ${urlPath} (${req.file.size} bytes, ${req.file.mimetype})`);

    // Create message in database (thumbnailUrl will be set async)
    const message = await Message.create({
      roomId,
      senderId: req.userId!,
      type: 'video',
      content: urlPath,
      caption: caption || undefined,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      thumbnailUrl: undefined, // Will be updated by thumbnail job
      status: 'sent',
      readBy: [req.userId!],
      clientSource: clientSource || undefined,
    });

    // Populate sender info
    await message.populate('senderId', 'username displayName isOnline status statusMessage');

    // Update room's lastMessageAt for sorting
    await Room.findByIdAndUpdate(roomId, { lastMessageAt: new Date() });

    // Emit socket event so connected clients receive the message
    const io = req.app.get('io');
    if (io) {
      await emitNewMessage({
        io,
        roomId,
        userId: req.userId!,
        message: message as any,
      });

      // Queue async thumbnail generation
      queueThumbnailJob({
        messageId: message._id.toString(),
        videoPath: absolutePath,
        io,
        roomId,
      });
    }

    // Return message (format expected by client)
    res.status(201).json({
      message
    });
  } catch (error) {
    console.error('Video upload error:', error);
    const message = error instanceof Error ? error.message : 'Erreur lors du téléchargement';
    res.status(400).json({ error: message });
  }
});

export default router;
