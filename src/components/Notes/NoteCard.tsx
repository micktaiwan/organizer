import React, { useState } from 'react';
import { Pin, MoreVertical, Trash2, Check, Square } from 'lucide-react';
import { Note } from '../../services/api';
import { LabelChip } from './LabelChip';

interface NoteCardProps {
  note: Note;
  onClick: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
  onToggleChecklistItem?: (itemId: string) => void;
}

export const NoteCard: React.FC<NoteCardProps> = ({
  note,
  onClick,
  onTogglePin,
  onDelete,
  onToggleChecklistItem,
}) => {
  const [showMenu, setShowMenu] = useState(false);

  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(!showMenu);
  };

  const handleAction = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation();
    setShowMenu(false);
    action();
  };

  const displayedLabels = note.labels.slice(0, 3);
  const extraLabelsCount = note.labels.length - 3;

  const displayedItems = note.items.slice(0, 5);
  const extraItemsCount = note.items.length - 5;

  return (
    <div
      className="note-card"
      style={{ backgroundColor: note.color }}
      onClick={onClick}
    >
      {/* Header with pin and menu */}
      <div className="note-card-header">
        {note.isPinned && (
          <Pin size={14} className="note-card-pin" />
        )}
        <div className="note-card-menu-wrapper">
          <button className="note-card-menu-btn" onClick={handleMenuClick}>
            <MoreVertical size={16} />
          </button>
          {showMenu && (
            <div className="note-card-menu">
              <button onClick={(e) => handleAction(e, onTogglePin)}>
                <Pin size={14} />
                {note.isPinned ? 'Désépingler' : 'Épingler'}
              </button>
              <button className="danger" onClick={(e) => handleAction(e, onDelete)}>
                <Trash2 size={14} />
                Supprimer
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Title */}
      {note.title && (
        <h3 className="note-card-title">{note.title}</h3>
      )}

      {/* Content */}
      {note.type === 'note' && note.content && (
        <p className="note-card-content">{note.content}</p>
      )}

      {/* Checklist items */}
      {note.type === 'checklist' && note.items.length > 0 && (
        <div className="note-card-checklist">
          {displayedItems.map((item) => (
            <div
              key={item._id}
              className={`note-card-checklist-item ${item.checked ? 'checked' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleChecklistItem?.(item._id);
              }}
            >
              {item.checked ? (
                <Check size={14} className="checklist-icon checked" />
              ) : (
                <Square size={14} className="checklist-icon" />
              )}
              <span>{item.text}</span>
            </div>
          ))}
          {extraItemsCount > 0 && (
            <span className="note-card-extra">+{extraItemsCount} de plus</span>
          )}
        </div>
      )}

      {/* Labels */}
      {note.labels.length > 0 && (
        <div className="note-card-labels">
          {displayedLabels.map((label) => (
            <LabelChip key={label._id} label={label} size="sm" />
          ))}
          {extraLabelsCount > 0 && (
            <span className="note-card-extra-labels">+{extraLabelsCount}</span>
          )}
        </div>
      )}

      {/* Assigned to */}
      {note.assignedTo && (
        <div className="note-card-assigned">
          <span className="note-card-assigned-avatar">
            {note.assignedTo.displayName?.[0] || note.assignedTo.username[0]}
          </span>
          <span className="note-card-assigned-name">
            {note.assignedTo.displayName || note.assignedTo.username}
          </span>
        </div>
      )}
    </div>
  );
};
