import { useCallback } from "react";
import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { compressImage, blobToDataUrl, isImageFile, formatFileSize } from "../utils/imageCompression";

interface UseFileHandlersParams {
  setPendingImage: (image: string | null) => void;
  setPendingImageBlob: (blob: Blob | null) => void;
  setPendingFile: (file: { file: File; name: string; size: number } | null) => void;
  setIsCompressing: (isCompressing: boolean) => void;
}

export function useFileHandlers({
  setPendingImage,
  setPendingImageBlob,
  setPendingFile,
  setIsCompressing,
}: UseFileHandlersParams) {
  // File picker handler (images)
  const handleSelectImageFile = useCallback(async () => {
    try {
      const filePath = await open({
        multiple: false,
        directory: false,
        filters: [
          {
            name: 'Images',
            extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic']
          }
        ]
      });

      if (!filePath) return; // User cancelled

      console.log('Selected file:', filePath);
      setIsCompressing(true);

      // Read file as Uint8Array
      const fileData = await readFile(filePath as string);

      // Validate file size before compression
      if (fileData.byteLength > 10 * 1024 * 1024) {
        alert('L\'image est trop volumineuse (max 10MB)');
        setIsCompressing(false);
        return;
      }

      // Convert to Blob (guess MIME type from extension)
      const extension = (filePath as string).split('.').pop()?.toLowerCase();
      const mimeType = extension === 'png' ? 'image/png' :
                       extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' :
                       extension === 'gif' ? 'image/gif' :
                       extension === 'webp' ? 'image/webp' :
                       extension === 'heic' ? 'image/heic' :
                       'image/jpeg';

      const originalBlob = new Blob([fileData], { type: mimeType });

      if (!isImageFile(originalBlob)) {
        alert('Veuillez sélectionner un fichier image valide');
        setIsCompressing(false);
        return;
      }

      console.log(`Original file size: ${formatFileSize(originalBlob.size)}`);

      // Compress image
      const { compressedFile, originalSize, compressedSize } = await compressImage(originalBlob);

      // Warn if still large after compression
      if (compressedSize > 2 * 1024 * 1024) {
        console.warn(`Image still large after compression: ${formatFileSize(compressedSize)}`);
      }

      console.log(`Compressed: ${formatFileSize(originalSize)} → ${formatFileSize(compressedSize)}`);

      // Convert to Data URL for preview
      const dataUrl = await blobToDataUrl(compressedFile);

      setPendingImage(dataUrl);
      setPendingImageBlob(compressedFile);
      setIsCompressing(false);
    } catch (error) {
      console.error('File selection error:', error);
      alert(`Erreur: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
      setIsCompressing(false);
    }
  }, [setPendingImage, setPendingImageBlob, setIsCompressing]);

  // File picker handler (non-image files)
  const handleSelectFile = useCallback(async () => {
    try {
      const filePath = await open({
        multiple: false,
        directory: false,
      });

      if (!filePath) return; // User cancelled

      console.log('Selected file:', filePath);

      // Read file as Uint8Array
      const fileData = await readFile(filePath as string);

      // Validate file size (25MB max)
      if (fileData.byteLength > 25 * 1024 * 1024) {
        alert('Le fichier est trop volumineux (max 25MB)');
        return;
      }

      // Extract filename from path
      const fileName = (filePath as string).split('/').pop() || (filePath as string).split('\\').pop() || 'file';

      // Guess MIME type from extension
      const extension = fileName.split('.').pop()?.toLowerCase() || '';
      const mimeTypes: Record<string, string> = {
        'pdf': 'application/pdf',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xls': 'application/vnd.ms-excel',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'ppt': 'application/vnd.ms-powerpoint',
        'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'txt': 'text/plain',
        'zip': 'application/zip',
        'rar': 'application/x-rar-compressed',
        '7z': 'application/x-7z-compressed',
        'mp4': 'video/mp4',
        'mov': 'video/quicktime',
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
      };
      const mimeType = mimeTypes[extension] || 'application/octet-stream';

      // Create File object
      const file = new File([fileData], fileName, { type: mimeType });

      setPendingFile({
        file,
        name: fileName,
        size: fileData.byteLength,
      });

    } catch (error) {
      console.error('File selection error:', error);
      alert(`Erreur: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }
  }, [setPendingFile]);

  return {
    handleSelectImageFile,
    handleSelectFile,
  };
}
