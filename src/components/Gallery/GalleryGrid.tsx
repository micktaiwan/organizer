import { Images } from 'lucide-react';
import { GalleryFile } from '../../services/api';
import { GalleryItem } from './GalleryItem';

interface GalleryGridProps {
  files: GalleryFile[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  currentUserId?: string;
  onItemClick: (file: GalleryFile) => void;
  onLoadMore: () => void;
  onDeleteFile: (fileId: string) => void;
}

export function GalleryGrid({ files, isLoading, isLoadingMore, hasMore, currentUserId, onItemClick, onLoadMore, onDeleteFile }: GalleryGridProps) {
  if (isLoading) {
    return (
      <div className="gallery-grid-container">
        <div className="gallery-loading">
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="gallery-grid-container">
        <div className="gallery-empty">
          <Images size={40} className="gallery-empty-icon" />
          <span>No files found</span>
        </div>
      </div>
    );
  }

  return (
    <div className="gallery-grid-container">
      <div className="gallery-grid">
        {files.map((file) => (
          <GalleryItem
            key={file.id}
            file={file}
            isOwner={currentUserId === file.senderId}
            onClick={() => onItemClick(file)}
            onDelete={onDeleteFile}
          />
        ))}
      </div>
      {hasMore && (
        <div className="gallery-load-more">
          <button
            className="gallery-load-more-btn"
            onClick={onLoadMore}
            disabled={isLoadingMore}
          >
            {isLoadingMore ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}
