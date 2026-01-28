interface GalleryHeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function GalleryHeader({ searchQuery, onSearchChange }: GalleryHeaderProps) {
  return (
    <div className="gallery-header">
      <input
        type="text"
        className="gallery-search-input"
        placeholder="Search files by name or caption..."
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
      />
    </div>
  );
}
