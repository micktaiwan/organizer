import { useEffect, useCallback } from 'react';
import { X, Download, Trash2, Music, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import { GalleryFile } from '../../services/api';
import { getFileUrl } from './GalleryItem';

interface GalleryOverlayProps {
  file: GalleryFile;
  files: GalleryFile[];
  currentUserId?: string;
  onClose: () => void;
  onDelete: (fileId: string) => Promise<boolean>;
  onNavigate: (file: GalleryFile) => void;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function GalleryOverlay({ file, files, currentUserId, onClose, onDelete, onNavigate }: GalleryOverlayProps) {
  const isOwner = currentUserId === file.senderId;
  const fileUrl = getFileUrl(file.url);

  const currentIndex = files.findIndex(f => f.id === file.id);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < files.length - 1;

  const goToPrev = useCallback(() => {
    if (hasPrev) onNavigate(files[currentIndex - 1]);
  }, [hasPrev, files, currentIndex, onNavigate]);

  const goToNext = useCallback(() => {
    if (hasNext) onNavigate(files[currentIndex + 1]);
  }, [hasNext, files, currentIndex, onNavigate]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowLeft') goToPrev();
    if (e.key === 'ArrowRight') goToNext();
  }, [onClose, goToPrev, goToNext]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const response = await fetch(fileUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.fileName || 'download';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    // Determine where to navigate before deleting (files list will shrink)
    const nextFile = hasNext ? files[currentIndex + 1]
      : hasPrev ? files[currentIndex - 1]
      : null;
    const ok = await onDelete(file.id);
    if (ok) {
      if (nextFile) {
        onNavigate(nextFile);
      } else {
        onClose();
      }
    }
  };

  const renderMedia = () => {
    switch (file.type) {
      case 'image':
        return (
          <img
            src={fileUrl}
            alt={file.fileName || 'Image'}
            className="gallery-overlay-image"
            onClick={(e) => e.stopPropagation()}
          />
        );

      case 'video':
        return (
          <video
            src={fileUrl}
            controls
            autoPlay
            className="gallery-overlay-video"
            onClick={(e) => e.stopPropagation()}
          />
        );

      case 'audio':
        return (
          <div className="gallery-overlay-audio" onClick={(e) => e.stopPropagation()}>
            <Music size={48} color="#6B9FFF" />
            <span className="gallery-overlay-audio-name">{file.fileName || 'Audio'}</span>
            <audio controls src={fileUrl} autoPlay />
          </div>
        );

      case 'file':
        return (
          <div className="gallery-overlay-file" onClick={(e) => e.stopPropagation()}>
            <FileText size={48} color="#6B9FFF" />
            <span className="gallery-overlay-file-name">{file.fileName || 'File'}</span>
            {file.fileSize && (
              <span className="gallery-overlay-file-size">{formatFileSize(file.fileSize)}</span>
            )}
            <button className="gallery-overlay-download-btn" onClick={handleDownload}>
              <Download size={16} />
              Download
            </button>
          </div>
        );
    }
  };

  return (
    <div className="gallery-overlay" onClick={onClose}>
      <div className="gallery-overlay-content">
        {renderMedia()}
      </div>

      {hasPrev && (
        <button className="gallery-overlay-nav gallery-overlay-nav-prev" onClick={(e) => { e.stopPropagation(); goToPrev(); }}>
          <ChevronLeft size={32} />
        </button>
      )}
      {hasNext && (
        <button className="gallery-overlay-nav gallery-overlay-nav-next" onClick={(e) => { e.stopPropagation(); goToNext(); }}>
          <ChevronRight size={32} />
        </button>
      )}

      <div className="gallery-overlay-buttons">
        {file.type !== 'file' && (
          <button className="gallery-overlay-btn" onClick={handleDownload} title="Download">
            <Download size={20} />
          </button>
        )}
        {isOwner && (
          <button className="gallery-overlay-btn danger" onClick={handleDelete} title="Delete">
            <Trash2 size={20} />
          </button>
        )}
        <button className="gallery-overlay-btn" onClick={(e) => { e.stopPropagation(); onClose(); }}>
          <X size={24} />
        </button>
      </div>

      <div className="gallery-overlay-info">
        <div className="gallery-overlay-info-left">
          <span className="gallery-overlay-info-room">{file.roomName}</span>
          <span className="gallery-overlay-info-sender">{file.senderName}</span>
          <span className="gallery-overlay-info-date">{formatDateTime(file.createdAt)}</span>
        </div>
        {file.fileName && (
          <span className="gallery-overlay-info-filename">{file.fileName}</span>
        )}
      </div>
    </div>
  );
}
