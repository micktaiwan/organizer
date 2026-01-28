import { Calendar, HardDrive } from 'lucide-react';
import { GalleryFilter, GallerySort } from '../../hooks/useGallery';

interface GalleryFilterChipsProps {
  activeFilter: GalleryFilter;
  activeSort: GallerySort;
  onFilterChange: (filter: GalleryFilter) => void;
  onSortChange: (sort: GallerySort) => void;
}

const filters: { id: GalleryFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'image', label: 'Images' },
  { id: 'video', label: 'Videos' },
  { id: 'audio', label: 'Audios' },
  { id: 'file', label: 'Files' },
];

const sorts: { id: GallerySort; label: string; icon: typeof Calendar }[] = [
  { id: 'date', label: 'Date', icon: Calendar },
  { id: 'size', label: 'Size', icon: HardDrive },
];

export function GalleryFilterChips({ activeFilter, activeSort, onFilterChange, onSortChange }: GalleryFilterChipsProps) {
  return (
    <div className="gallery-filter-chips">
      {filters.map((f) => (
        <button
          key={f.id}
          className={`gallery-filter-chip ${activeFilter === f.id ? 'active' : ''}`}
          onClick={() => onFilterChange(f.id)}
        >
          {f.label}
        </button>
      ))}

      <span className="gallery-filter-separator" />

      {sorts.map((s) => {
        const Icon = s.icon;
        return (
          <button
            key={s.id}
            className={`gallery-filter-chip gallery-sort-chip ${activeSort === s.id ? 'active' : ''}`}
            onClick={() => onSortChange(s.id)}
          >
            <Icon size={12} />
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
