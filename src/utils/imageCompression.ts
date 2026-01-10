import imageCompression from 'browser-image-compression';

export interface CompressionOptions {
  maxSizeMB: number;
  maxWidthOrHeight: number;
  useWebWorker: boolean;
  fileType?: 'image/jpeg' | 'image/png' | 'image/webp';
  initialQuality?: number;
}

export interface CompressionResult {
  compressedFile: Blob;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
}

/**
 * Compress image with intelligent fallback strategy
 * Target: max 1920px, preserves original format, <2MB
 */
export async function compressImage(
  file: File | Blob,
  options?: Partial<CompressionOptions>
): Promise<CompressionResult> {
  const originalSize = file.size;

  // Detect original file type and preserve it
  const originalType = file.type;
  let targetFileType: 'image/jpeg' | 'image/png' | 'image/webp' = 'image/jpeg';

  if (originalType === 'image/png') {
    targetFileType = 'image/png';
  } else if (originalType === 'image/webp') {
    targetFileType = 'image/webp';
  } else {
    // JPEG, HEIC, GIF, or unknown → convert to JPEG for better compression
    targetFileType = 'image/jpeg';
  }

  // Default options
  const defaultOptions: CompressionOptions = {
    maxSizeMB: 2,
    maxWidthOrHeight: 1920,
    useWebWorker: true,
    fileType: targetFileType,
    initialQuality: 0.8,
  };

  const finalOptions = { ...defaultOptions, ...options };

  try {
    const compressedFile = await imageCompression(file as File, {
      maxSizeMB: finalOptions.maxSizeMB,
      maxWidthOrHeight: finalOptions.maxWidthOrHeight,
      useWebWorker: finalOptions.useWebWorker,
      fileType: finalOptions.fileType,
      initialQuality: finalOptions.initialQuality,
    });

    const compressedSize = compressedFile.size;
    const compressionRatio = (1 - compressedSize / originalSize) * 100;

    console.log(`Image compressed: ${(originalSize / 1024 / 1024).toFixed(2)}MB → ${(compressedSize / 1024 / 1024).toFixed(2)}MB (${compressionRatio.toFixed(1)}% reduction)`);

    return {
      compressedFile,
      originalSize,
      compressedSize,
      compressionRatio,
    };
  } catch (error) {
    console.error('Image compression failed:', error);
    // Fallback: return original as Blob
    return {
      compressedFile: file,
      originalSize,
      compressedSize: originalSize,
      compressionRatio: 0,
    };
  }
}

/**
 * Convert compressed Blob to Data URL for preview
 */
export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Validate file type is image
 */
export function isImageFile(file: File | Blob): boolean {
  if (file instanceof File) {
    return file.type.startsWith('image/');
  }
  return file.type.startsWith('image/');
}

/**
 * Get human-readable file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
