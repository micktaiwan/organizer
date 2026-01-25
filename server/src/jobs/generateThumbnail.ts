import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import { Message } from '../models/index.js';
import { Server } from 'socket.io';

const execAsync = promisify(exec);

interface ThumbnailJobParams {
  messageId: string;
  videoPath: string;
  io: Server;
  roomId: string;
}

interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
}

/**
 * Queue thumbnail generation job (runs async via setImmediate)
 */
export function queueThumbnailJob(params: ThumbnailJobParams): void {
  setImmediate(async () => {
    try {
      await generateThumbnail(params);
    } catch (error) {
      console.error(`Thumbnail generation failed for message ${params.messageId}:`, error);
    }
  });
}

/**
 * Get video metadata using ffprobe
 */
async function getVideoMetadata(videoPath: string): Promise<VideoMetadata> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${videoPath}"`
    );
    const data = JSON.parse(stdout);

    // Find video stream
    const videoStream = data.streams?.find((s: any) => s.codec_type === 'video');

    return {
      duration: parseFloat(data.format?.duration || '0'),
      width: videoStream?.width || 0,
      height: videoStream?.height || 0,
    };
  } catch (error) {
    console.warn('Could not get video metadata:', error);
    return { duration: 0, width: 0, height: 0 };
  }
}

/**
 * Generate thumbnail from video and update message
 */
async function generateThumbnail({ messageId, videoPath, io, roomId }: ThumbnailJobParams): Promise<void> {
  // Generate thumbnail filename (same folder as video)
  const videoDir = path.dirname(videoPath);
  const videoBasename = path.basename(videoPath, path.extname(videoPath));
  const thumbnailFilename = `thumb-${videoBasename}.jpg`;
  const thumbnailPath = path.join(videoDir, thumbnailFilename);

  // Calculate relative path for DB storage
  const publicDir = path.join(process.cwd(), 'public');
  const relativeThumbnailPath = thumbnailPath.replace(publicDir, '');

  // Get video metadata first
  const metadata = await getVideoMetadata(videoPath);

  // ffmpeg command: extract frame at 0.1s, scale to 320px width, maintain aspect ratio
  const cmd = `ffmpeg -i "${videoPath}" -ss 0.1 -vframes 1 -vf "scale=320:-1" -y "${thumbnailPath}"`;

  try {
    await execAsync(cmd);

    // Verify thumbnail was created
    if (!fs.existsSync(thumbnailPath)) {
      throw new Error('Thumbnail file was not created');
    }

    // Update message in DB with thumbnail and metadata
    await Message.findByIdAndUpdate(messageId, {
      thumbnailUrl: relativeThumbnailPath,
      duration: metadata.duration,
      width: metadata.width,
      height: metadata.height,
    });

    // Emit socket event to all clients in the room (socket rooms use 'room:' prefix)
    const roomKey = `room:${roomId}`;
    const socketsInRoom = io.sockets.adapter.rooms.get(roomKey);
    console.log(`[Thumbnail] Emitting to ${roomKey}, sockets in room:`, socketsInRoom?.size ?? 0);

    io.to(roomKey).emit('video:thumbnail-ready', {
      messageId,
      thumbnailUrl: relativeThumbnailPath,
      duration: metadata.duration,
      width: metadata.width,
      height: metadata.height,
    });

    console.log(`✓ Thumbnail generated for message ${messageId}: ${relativeThumbnailPath}`);
  } catch (error) {
    console.error(`ffmpeg thumbnail generation failed:`, error);
    // Don't throw - message is still valid without thumbnail
  }
}
