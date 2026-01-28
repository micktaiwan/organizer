import { useState } from 'react';
import { GalleryFile } from '../services/api';
import { GalleryFilter, GallerySort } from '../hooks/useGallery';
import { GalleryHeader, GalleryFilterChips, GalleryGrid, GalleryOverlay } from './Gallery';
import './Gallery/Gallery.css';

interface GalleryTabContentProps {
  files: GalleryFile[];
  filter: GalleryFilter;
  sort: GallerySort;
  searchQuery: string;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  currentUserId?: string;
  onFilterChange: (filter: GalleryFilter) => void;
  onSortChange: (sort: GallerySort) => void;
  onSearchChange: (query: string) => void;
  onLoadMore: () => void;
  onDeleteFile: (fileId: string) => Promise<boolean>;
}

export function GalleryTabContent({
  files,
  filter,
  sort,
  searchQuery,
  isLoading,
  isLoadingMore,
  hasMore,
  currentUserId,
  onFilterChange,
  onSortChange,
  onSearchChange,
  onLoadMore,
  onDeleteFile,
}: GalleryTabContentProps) {
  const [selectedFile, setSelectedFile] = useState<GalleryFile | null>(null);

  return (
    <div className="gallery-tab-content">
      <GalleryHeader searchQuery={searchQuery} onSearchChange={onSearchChange} />
      <GalleryFilterChips activeFilter={filter} activeSort={sort} onFilterChange={onFilterChange} onSortChange={onSortChange} />
      <GalleryGrid
        files={files}
        isLoading={isLoading}
        isLoadingMore={isLoadingMore}
        hasMore={hasMore}
        currentUserId={currentUserId}
        onItemClick={setSelectedFile}
        onLoadMore={onLoadMore}
        onDeleteFile={(id) => onDeleteFile(id)}
      />
      {selectedFile && (
        <GalleryOverlay
          file={selectedFile}
          files={files}
          currentUserId={currentUserId}
          onClose={() => setSelectedFile(null)}
          onDelete={onDeleteFile}
          onNavigate={setSelectedFile}
        />
      )}
    </div>
  );
}
