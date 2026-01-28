import { Play, Mic, Music, FileText, Trash2 } from 'lucide-react';
import { GalleryFile } from '../../services/api';
import { getApiBaseUrl } from '../../services/api';

interface GalleryItemProps {
  file: GalleryFile;
  isOwner: boolean;
  onClick: () => void;
  onDelete: (fileId: string) => void;
}

function getFileUrl(url: string): string {
  if (url.startsWith('data:')) return url;
  if (url.startsWith('/')) return `${getApiBaseUrl()}${url}`;
  return url;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function GalleryItem({ file, isOwner, onClick, onDelete }: GalleryItemProps) {
  const renderContent = () => {
    switch (file.type) {
      case 'image':
        return <img src={getFileUrl(file.url)} alt={file.fileName || 'Image'} loading="lazy" />;

      case 'video':
        return (
          <>
            {file.thumbnailUrl ? (
              <img src={getFileUrl(file.thumbnailUrl)} alt={file.fileName || 'Video'} loading="lazy" />
            ) : (
              <div className="gallery-item-icon">
                <Play size={28} color="#6B9FFF" />
              </div>
            )}
            <div className="gallery-item-video-badge">
              <Play size={18} color="#fff" fill="#fff" />
            </div>
            {file.duration != null && (
              <span className="gallery-item-duration">{formatDuration(file.duration)}</span>
            )}
          </>
        );

      case 'audio': {
        const isVoice = file.isVoiceNote;
        const Icon = isVoice ? Mic : Music;
        const label = isVoice ? 'Voice' : (file.fileName || 'Audio');
        return (
          <div className="gallery-item-icon">
            <div className={`gallery-item-audio-badge ${isVoice ? 'voice' : 'music'}`}>
              <Icon size={22} color="#fff" />
            </div>
            <span className="gallery-item-icon-name">{label}</span>
          </div>
        );
      }

      case 'file':
        return (
          <div className="gallery-item-icon">
            <FileText size={28} color="#6B9FFF" />
            <span className="gallery-item-icon-name">{file.fileName || 'File'}</span>
          </div>
        );
    }
  };

  return (
    <div className="gallery-item" onClick={onClick}>
      {renderContent()}
      {isOwner && (
        <button
          className="gallery-item-delete"
          onClick={(e) => { e.stopPropagation(); onDelete(file.id); }}
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      )}
      <div className="gallery-item-meta">
        <span>{file.roomName}</span>
        <span>{formatDate(file.createdAt)}</span>
      </div>
    </div>
  );
}

export { getFileUrl };
