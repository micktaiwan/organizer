import { Router, Response } from 'express';
import { Message } from '../models/Message.js';
import { Room } from '../models/Room.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { Types } from 'mongoose';
import fs from 'fs';
import path from 'path';

const router = Router();
router.use(authMiddleware);

interface FileResult {
  id: string;
  type: 'image' | 'file' | 'video' | 'audio';
  url: string;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  caption: string | null;
  roomId: string;
  roomName: string;
  senderId: string;
  senderName: string;
  createdAt: string;
  // Video-specific fields
  thumbnailUrl?: string | null;
  duration?: number | null;
  width?: number | null;
  height?: number | null;
}

// GET /files - Get all files the user has access to
// Query params:
//   - limit: max files to return (default 100, max 200)
//   - before: ISO date - only files created before this date (pagination)
//   - after: ISO date - only files created after this date (incremental sync)
//   - type: "image", "file", "video", or "audio" filter
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = new Types.ObjectId(req.userId!);
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 200);
    const before = req.query.before as string | undefined;
    const after = req.query.after as string | undefined;
    const typeFilter = req.query.type as string | undefined;

    // Get all rooms user is a member of
    const userRooms = await Room.find({
      'members.userId': userId
    }).select('_id name');

    const roomIds = userRooms.map(r => r._id);
    const roomNameMap = new Map(userRooms.map(r => [r._id.toString(), r.name]));

    // Build query for files (exclude deleted files)
    const typeQuery = typeFilter === 'image' ? 'image'
      : typeFilter === 'file' ? 'file'
      : typeFilter === 'video' ? 'video'
      : typeFilter === 'audio' ? 'audio'
      : { $in: ['image', 'file', 'video', 'audio'] };

    const query: Record<string, unknown> = {
      roomId: { $in: roomIds },
      type: typeQuery,
      fileDeleted: { $ne: true }
    };

    // Date filters
    if (before && after) {
      query.createdAt = { $lt: new Date(before), $gt: new Date(after) };
    } else if (before) {
      query.createdAt = { $lt: new Date(before) };
    } else if (after) {
      query.createdAt = { $gt: new Date(after) };
    }

    // Get messages with files (with projection for performance)
    const messages = await Message.find(query, {
      _id: 1,
      type: 1,
      content: 1,
      fileName: 1,
      fileSize: 1,
      mimeType: 1,
      caption: 1,
      roomId: 1,
      senderId: 1,
      createdAt: 1,
      // Video-specific fields
      thumbnailUrl: 1,
      duration: 1,
      width: 1,
      height: 1
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('senderId', 'displayName username')
      .lean();

    const files: FileResult[] = messages.map(msg => {
      const sender = msg.senderId as unknown as { _id: Types.ObjectId; displayName: string; username: string };
      const result: FileResult = {
        id: msg._id.toString(),
        type: msg.type as 'image' | 'file' | 'video' | 'audio',
        url: msg.content,
        fileName: msg.fileName || null,
        fileSize: msg.fileSize || null,
        mimeType: msg.mimeType || null,
        caption: msg.caption || null,
        roomId: msg.roomId.toString(),
        roomName: roomNameMap.get(msg.roomId.toString()) || 'Unknown',
        senderId: sender._id.toString(),
        senderName: sender.displayName || sender.username,
        createdAt: msg.createdAt.toISOString()
      };
      // Add video-specific fields if present
      if (msg.type === 'video') {
        result.thumbnailUrl = (msg as any).thumbnailUrl || null;
        result.duration = (msg as any).duration || null;
        result.width = (msg as any).width || null;
        result.height = (msg as any).height || null;
      }
      return result;
    });

    res.json({ files });
  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

// DELETE /files/:fileId - Soft delete a file
// The file is deleted from disk but the message remains with fileDeleted=true
router.delete('/:fileId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = new Types.ObjectId(req.userId!);
    const { fileId } = req.params;

    // Find the message
    const message = await Message.findById(fileId);
    if (!message) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    // Verify the user is the author
    if (message.senderId.toString() !== userId.toString()) {
      res.status(403).json({ error: 'You can only delete your own files' });
      return;
    }

    // Verify it's a file/image/video/audio message
    if (message.type !== 'image' && message.type !== 'file' && message.type !== 'video' && message.type !== 'audio') {
      res.status(400).json({ error: 'This message is not a file' });
      return;
    }

    // Already deleted?
    if (message.fileDeleted) {
      res.status(400).json({ error: 'File already deleted' });
      return;
    }

    // Delete the physical file if it's a server file (not base64)
    const fileUrl = message.content;
    if (fileUrl.startsWith('/uploads/')) {
      const filePath = path.join(process.cwd(), 'public', fileUrl);
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`Deleted file: ${filePath}`);
        }
      } catch (fsError) {
        console.error('Failed to delete physical file:', fsError);
        // Continue anyway - we still want to mark as deleted
      }
    }

    // Mark the message as fileDeleted
    message.fileDeleted = true;
    await message.save();

    // Emit socket event to notify clients
    const io = req.app.get('io');
    io.to(message.roomId.toString()).emit('file:deleted', {
      messageId: message._id.toString(),
      roomId: message.roomId.toString()
    });

    res.json({ success: true, messageId: message._id.toString() });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

export default router;
