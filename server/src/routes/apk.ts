import { Router, Response, Request } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { ApkVersion } from '../models/ApkVersion.js';
import { authMiddleware, adminMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

// APK storage configuration
const APK_DIR = path.join(process.cwd(), 'public', 'apk');

// Ensure APK directory exists
if (!fs.existsSync(APK_DIR)) {
  fs.mkdirSync(APK_DIR, { recursive: true });
}

// Multer configuration for APK uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, APK_DIR),
  filename: (_req, _file, cb) => {
    // Use temp name, will be renamed after upload with correct version
    cb(null, `organizer-temp-${Date.now()}.apk`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/vnd.android.package-archive' ||
        file.originalname.endsWith('.apk')) {
      cb(null, true);
    } else {
      cb(new Error('Only APK files are allowed'));
    }
  }
});

// Helper: Calculate SHA-256 checksum
function calculateChecksum(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', data => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

// POST /apk/upload - Admin only, upload new APK
router.post(
  '/upload',
  authMiddleware,
  adminMiddleware,
  upload.single('apk'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No APK file provided' });
        return;
      }

      const { version, versionCode, releaseNotes } = req.body;

      if (!version || !versionCode) {
        fs.unlinkSync(req.file.path);
        res.status(400).json({ error: 'version and versionCode are required' });
        return;
      }

      const versionCodeNum = parseInt(versionCode, 10);

      // Check if version already exists
      const existing = await ApkVersion.findOne({
        $or: [{ version }, { versionCode: versionCodeNum }]
      });

      if (existing) {
        fs.unlinkSync(req.file.path);
        res.status(409).json({ error: 'Version already exists' });
        return;
      }

      // Calculate checksum
      const checksum = await calculateChecksum(req.file.path);

      // Rename file with correct version
      const finalFilename = `organizer-${version}.apk`;
      const finalPath = path.join(APK_DIR, finalFilename);
      fs.renameSync(req.file.path, finalPath);

      // Set previous latest to false
      await ApkVersion.updateMany({}, { isLatest: false });

      // Create new APK version record
      const apkVersion = new ApkVersion({
        version,
        versionCode: versionCodeNum,
        filename: finalFilename,
        fileSize: req.file.size,
        checksum,
        releaseNotes: releaseNotes || '',
        isLatest: true,
        uploadedBy: req.userId,
      });

      await apkVersion.save();

      res.status(201).json({
        success: true,
        apkVersion: {
          version: apkVersion.version,
          versionCode: apkVersion.versionCode,
          filename: apkVersion.filename,
          fileSize: apkVersion.fileSize,
          checksum: apkVersion.checksum,
          downloadUrl: `/apk/download/${apkVersion.filename}`,
        }
      });
    } catch (error) {
      console.error('APK upload error:', error);
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({ error: 'Server error during upload' });
    }
  }
);

// GET /apk/latest - Public, get latest version info
router.get('/latest', async (_req: Request, res: Response): Promise<void> => {
  try {
    const latest = await ApkVersion.findOne({ isLatest: true })
      .select('-uploadedBy -__v');

    if (!latest) {
      res.status(404).json({ error: 'No APK version available' });
      return;
    }

    res.json({
      version: latest.version,
      versionCode: latest.versionCode,
      fileSize: latest.fileSize,
      checksum: latest.checksum,
      releaseNotes: latest.releaseNotes,
      downloadUrl: `/apk/download/${latest.filename}`,
      createdAt: latest.createdAt,
    });
  } catch (error) {
    console.error('Get latest APK error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /apk/download/:filename - Public, download APK file
router.get('/download/:filename', async (req: Request, res: Response): Promise<void> => {
  try {
    const { filename } = req.params;

    // Security: sanitize filename
    const sanitizedFilename = path.basename(filename);
    const filePath = path.join(APK_DIR, sanitizedFilename);

    // Check file exists
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'APK file not found' });
      return;
    }

    // Increment download count
    await ApkVersion.findOneAndUpdate(
      { filename: sanitizedFilename },
      { $inc: { downloadCount: 1 } }
    );

    // Set headers for APK download
    const stat = fs.statSync(filePath);
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFilename}"`);
    res.setHeader('Content-Length', stat.size);

    // Stream file
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (error) {
    console.error('APK download error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /apk/versions - Public, list all versions (with optional limit)
router.get('/versions', async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string, 10);

    let query = ApkVersion.find()
      .sort({ versionCode: -1 })
      .select('version versionCode releaseNotes isLatest createdAt');

    if (limit > 0) {
      query = query.limit(limit);
    }

    const versions = await query;

    res.json({ versions });
  } catch (error) {
    console.error('List APK versions error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /apk/:version - Admin only, delete a version
router.delete(
  '/:version',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const apkVersion = await ApkVersion.findOne({ version: req.params.version });

      if (!apkVersion) {
        res.status(404).json({ error: 'Version not found' });
        return;
      }

      // Delete file
      const filePath = path.join(APK_DIR, apkVersion.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      // Delete record
      await apkVersion.deleteOne();

      // If deleted was latest, make previous version latest
      if (apkVersion.isLatest) {
        const previous = await ApkVersion.findOne().sort({ versionCode: -1 });
        if (previous) {
          previous.isLatest = true;
          await previous.save();
        }
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Delete APK version error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

export default router;
