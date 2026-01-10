import React, { useState } from 'react';
import { Plus, RefreshCw, Tag, StickyNote, CheckSquare } from 'lucide-react';
import { Note, Label } from '../../services/api';
import { NoteCard } from './NoteCard';
import { LabelChip } from './LabelChip';

interface NotesListProps {
  notes: Note[];
  labels: Label[];
  selectedLabelId: string | null;
  isLoading: boolean;
  error: string | null;
  onSelectNote: (noteId: string) => void;
  onCreateNote: (type: 'note' | 'checklist') => void;
  onTogglePin: (noteId: string) => void;
  onDeleteNote: (noteId: string) => void;
  onToggleChecklistItem: (noteId: string, itemId: string) => void;
  onFilterByLabel: (labelId: string | null) => void;
  onRefresh: () => void;
  onManageLabels: () => void;
}

export const NotesList: React.FC<NotesListProps> = ({
  notes,
  labels,
  selectedLabelId,
  isLoading,
  error,
  onSelectNote,
  onCreateNote,
  onTogglePin,
  onDeleteNote,
  onToggleChecklistItem,
  onFilterByLabel,
  onRefresh,
  onManageLabels,
}) => {
  const [showCreateMenu, setShowCreateMenu] = useState(false);

  const pinnedNotes = notes.filter(n => n.isPinned);
  const regularNotes = notes.filter(n => !n.isPinned);

  const handleCreateNote = (type: 'note' | 'checklist') => {
    setShowCreateMenu(false);
    onCreateNote(type);
  };

  return (
    <div className="notes-container">
      {/* Header */}
      <div className="notes-header">
        <h1 className="notes-title">Notes</h1>
        <div className="notes-header-actions">
          <button
            className="notes-header-btn"
            onClick={onRefresh}
            disabled={isLoading}
          >
            <RefreshCw size={18} className={isLoading ? 'spinning' : ''} />
          </button>
          <button
            className="notes-header-btn"
            onClick={onManageLabels}
          >
            <Tag size={18} />
          </button>
        </div>
      </div>

      {/* Label filters */}
      {labels.length > 0 && (
        <div className="notes-label-filters">
          <button
            className={`notes-label-filter-all ${!selectedLabelId ? 'selected' : ''}`}
            onClick={() => onFilterByLabel(null)}
          >
            Toutes
          </button>
          {labels.map((label) => (
            <LabelChip
              key={label._id}
              label={label}
              selected={selectedLabelId === label._id}
              onClick={() => onFilterByLabel(selectedLabelId === label._id ? null : label._id)}
            />
          ))}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="notes-error">
          <p>{error}</p>
          <button onClick={onRefresh}>Réessayer</button>
        </div>
      )}

      {/* Loading state */}
      {isLoading && notes.length === 0 && (
        <div className="notes-loading">
          <RefreshCw size={24} className="spinning" />
          <p>Chargement des notes...</p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && notes.length === 0 && (
        <div className="notes-empty">
          <StickyNote size={48} />
          <p>Aucune note</p>
          <span>Créez votre première note avec le bouton +</span>
        </div>
      )}

      {/* Notes grid */}
      {notes.length > 0 && (
        <div className="notes-content">
          {/* Pinned section */}
          {pinnedNotes.length > 0 && (
            <div className="notes-section">
              <h2 className="notes-section-title">Épinglées</h2>
              <div className="notes-grid">
                {pinnedNotes.map((note) => (
                  <NoteCard
                    key={note._id}
                    note={note}
                    onClick={() => onSelectNote(note._id)}
                    onTogglePin={() => onTogglePin(note._id)}
                    onDelete={() => onDeleteNote(note._id)}
                    onToggleChecklistItem={(itemId) => onToggleChecklistItem(note._id, itemId)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Regular notes section */}
          {regularNotes.length > 0 && (
            <div className="notes-section">
              {pinnedNotes.length > 0 && (
                <h2 className="notes-section-title">Autres</h2>
              )}
              <div className="notes-grid">
                {regularNotes.map((note) => (
                  <NoteCard
                    key={note._id}
                    note={note}
                    onClick={() => onSelectNote(note._id)}
                    onTogglePin={() => onTogglePin(note._id)}
                    onDelete={() => onDeleteNote(note._id)}
                    onToggleChecklistItem={(itemId) => onToggleChecklistItem(note._id, itemId)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* FAB for creating notes */}
      <div className="notes-fab-container">
        <button
          className="notes-fab"
          onClick={() => setShowCreateMenu(!showCreateMenu)}
        >
          <Plus size={24} />
        </button>
        {showCreateMenu && (
          <div className="notes-fab-menu">
            <button onClick={() => handleCreateNote('note')}>
              <StickyNote size={18} />
              Note
            </button>
            <button onClick={() => handleCreateNote('checklist')}>
              <CheckSquare size={18} />
              Checklist
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
