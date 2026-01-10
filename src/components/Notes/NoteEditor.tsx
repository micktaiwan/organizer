import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  ArrowLeft,
  Trash2,
  Check,
  Square,
  Plus,
  X,
  StickyNote,
  CheckSquare,
  Pin,
} from 'lucide-react';
import { Note, Label, UpdateNoteRequest } from '../../services/api';
import { LabelChip } from './LabelChip';

// Debounce helper
function debounce<T extends (...args: Parameters<T>) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// Color palette similar to Android
const NOTE_COLORS = [
  '#1a1a1a', // Default dark
  '#5c2b29', // Dark red
  '#614a19', // Dark orange
  '#635d19', // Dark yellow
  '#345920', // Dark green
  '#2d555e', // Dark teal
  '#1e3a5f', // Dark blue
  '#42275e', // Dark purple
];

interface NoteEditorProps {
  note: Note | null;
  labels: Label[];
  isCreating: boolean;
  initialType?: 'note' | 'checklist';
  onSave: (noteId: string | null, data: UpdateNoteRequest) => void;
  onDelete: (noteId: string) => void;
  onClose: () => void;
  onAddChecklistItem: (noteId: string, text: string) => Promise<boolean>;
  onUpdateChecklistItemText: (noteId: string, itemId: string, text: string) => Promise<boolean>;
  onToggleChecklistItem: (noteId: string, itemId: string) => Promise<boolean>;
  onDeleteChecklistItem: (noteId: string, itemId: string) => Promise<boolean>;
}

export const NoteEditor: React.FC<NoteEditorProps> = ({
  note,
  labels,
  isCreating,
  initialType = 'note',
  onSave,
  onDelete,
  onClose,
  onAddChecklistItem,
  onUpdateChecklistItemText,
  onToggleChecklistItem,
  onDeleteChecklistItem,
}) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [type, setType] = useState<'note' | 'checklist'>(initialType);
  const [color, setColor] = useState(NOTE_COLORS[0]);
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [isPinned, setIsPinned] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLabelPicker, setShowLabelPicker] = useState(false);
  const [newItemText, setNewItemText] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  // Local state for checklist item texts (to handle debouncing)
  const [localItemTexts, setLocalItemTexts] = useState<Record<string, string>>({});
  // Pending items for type conversion (note → checklist)
  const [pendingItems, setPendingItems] = useState<{ text: string; checked: boolean; order: number }[] | null>(null);

  const newItemInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Debounced update function for checklist items (500ms delay)
  const debouncedUpdateItem = useMemo(
    () => debounce((noteId: string, itemId: string, text: string) => {
      onUpdateChecklistItemText(noteId, itemId, text);
    }, 500),
    [onUpdateChecklistItemText]
  );

  // Initialize form with note data
  useEffect(() => {
    if (note) {
      setTitle(note.title);
      setContent(note.content);
      setType(note.type);
      setColor(note.color);
      setSelectedLabels(note.labels.map(l => l._id));
      setIsPinned(note.isPinned);
      setHasChanges(false);
      // Reset local item texts when note changes
      setLocalItemTexts({});
    } else {
      setTitle('');
      setContent('');
      setType(initialType);
      setColor(NOTE_COLORS[0]);
      setSelectedLabels([]);
      setIsPinned(false);
      setHasChanges(false);
      setLocalItemTexts({});
      setPendingItems(null);
    }
  }, [note, initialType]);

  // Focus title on create
  useEffect(() => {
    if (isCreating && titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, [isCreating]);

  // Mark as changed when fields change
  useEffect(() => {
    if (!note && !isCreating) return;
    setHasChanges(true);
  }, [title, content, type, color, selectedLabels, isPinned, pendingItems]);

  // Handle save
  const handleSave = useCallback(() => {
    const data: UpdateNoteRequest = {
      title,
      content,
      type,
      color,
      labels: selectedLabels,
      isPinned,
    };
    // Include pending items if converting to checklist
    if (pendingItems) {
      data.items = pendingItems;
    }
    onSave(note?._id || null, data);
    setPendingItems(null);
  }, [note, title, content, type, color, selectedLabels, isPinned, pendingItems, onSave]);

  // Auto-save on close
  const handleClose = useCallback(() => {
    if (hasChanges && (title.trim() || content.trim() || (note && note.items.length > 0) || (pendingItems && pendingItems.length > 0))) {
      handleSave();
    }
    onClose();
  }, [hasChanges, title, content, note, pendingItems, handleSave, onClose]);

  // Handle type toggle with data conversion and immediate save
  const handleTypeToggle = () => {
    if (type === 'checklist') {
      // Converting checklist → note: join items into content
      const newContent = note && note.items.length > 0
        ? note.items.map(item => item.text).join('\n')
        : content;

      setContent(newContent);
      setType('note');
      setPendingItems(null);

      // Save immediately for real-time sync
      if (note) {
        onSave(note._id, {
          title,
          content: newContent,
          type: 'note',
          color,
          labels: selectedLabels,
          isPinned,
        });
        setHasChanges(false);
      }
    } else {
      // Converting note → checklist: split content into items
      const items = content.trim()
        ? content.split('\n').filter(line => line.trim()).map((line, index) => ({
            text: line.trim(),
            checked: false,
            order: index,
          }))
        : [];

      setPendingItems(items);
      setType('checklist');

      // Save immediately for real-time sync
      if (note) {
        onSave(note._id, {
          title,
          content: '',
          type: 'checklist',
          color,
          labels: selectedLabels,
          isPinned,
          items,
        });
        setPendingItems(null); // Clear pending since we saved
        setHasChanges(false);
      }
    }
  };

  // Handle label toggle
  const toggleLabel = (labelId: string) => {
    setSelectedLabels(prev =>
      prev.includes(labelId)
        ? prev.filter(id => id !== labelId)
        : [...prev, labelId]
    );
  };

  // Handle add checklist item
  const handleAddItem = async () => {
    if (!newItemText.trim() || !note) return;

    const success = await onAddChecklistItem(note._id, newItemText.trim());
    if (success) {
      setNewItemText('');
      newItemInputRef.current?.focus();
    }
  };

  // Handle item text change with debounce
  const handleItemTextChange = (itemId: string, text: string) => {
    if (!note) return;
    // Update local state immediately for responsive UI
    setLocalItemTexts(prev => ({ ...prev, [itemId]: text }));
    // Debounce the API call
    debouncedUpdateItem(note._id, itemId, text);
  };

  // Get item text (local if being edited, otherwise from note)
  const getItemText = (itemId: string, originalText: string): string => {
    return localItemTexts[itemId] !== undefined ? localItemTexts[itemId] : originalText;
  };

  // Handle delete confirmation
  const handleDelete = () => {
    if (note) {
      onDelete(note._id);
    }
  };

  return (
    <div className="note-editor" style={{ backgroundColor: color }}>
      {/* Header */}
      <div className="note-editor-header">
        <button className="note-editor-back" onClick={handleClose}>
          <ArrowLeft size={20} />
        </button>
        <div className="note-editor-header-actions">
          <button
            className={`note-editor-pin-btn ${isPinned ? 'active' : ''}`}
            onClick={() => setIsPinned(!isPinned)}
          >
            <Pin size={18} />
          </button>
          {note && (
            <button
              className="note-editor-delete-btn"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Title */}
      <input
        ref={titleInputRef}
        type="text"
        className="note-editor-title"
        placeholder="Titre"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      {/* Content for note type */}
      {type === 'note' && (
        <textarea
          className="note-editor-content"
          placeholder="Commencez à écrire..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
      )}

      {/* Checklist items */}
      {type === 'checklist' && note && !pendingItems && (
        <div className="note-editor-checklist">
          {note.items.map((item) => (
            <div
              key={item._id}
              className={`note-editor-checklist-item ${item.checked ? 'checked' : ''}`}
            >
              <button
                className="checklist-checkbox"
                onClick={() => onToggleChecklistItem(note._id, item._id)}
              >
                {item.checked ? (
                  <Check size={18} />
                ) : (
                  <Square size={18} />
                )}
              </button>
              <input
                type="text"
                value={getItemText(item._id, item.text)}
                onChange={(e) => handleItemTextChange(item._id, e.target.value)}
                className="checklist-item-text"
              />
              <button
                className="checklist-item-delete"
                onClick={() => onDeleteChecklistItem(note._id, item._id)}
              >
                <X size={16} />
              </button>
            </div>
          ))}

          {/* Add new item */}
          <div className="note-editor-checklist-add">
            <Plus size={18} />
            <input
              ref={newItemInputRef}
              type="text"
              placeholder="Ajouter un élément"
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddItem();
                }
              }}
            />
          </div>
        </div>
      )}

      {/* Pending checklist items (after conversion from note) */}
      {type === 'checklist' && pendingItems && (
        <div className="note-editor-checklist">
          {pendingItems.map((item, index) => (
            <div
              key={`pending-${index}`}
              className={`note-editor-checklist-item ${item.checked ? 'checked' : ''}`}
            >
              <button
                className="checklist-checkbox"
                onClick={() => {
                  setPendingItems(prev => prev?.map((it, i) =>
                    i === index ? { ...it, checked: !it.checked } : it
                  ) ?? null);
                }}
              >
                {item.checked ? (
                  <Check size={18} />
                ) : (
                  <Square size={18} />
                )}
              </button>
              <input
                type="text"
                value={item.text}
                onChange={(e) => {
                  setPendingItems(prev => prev?.map((it, i) =>
                    i === index ? { ...it, text: e.target.value } : it
                  ) ?? null);
                }}
                className="checklist-item-text"
              />
              <button
                className="checklist-item-delete"
                onClick={() => {
                  setPendingItems(prev => prev?.filter((_, i) => i !== index) ?? null);
                }}
              >
                <X size={16} />
              </button>
            </div>
          ))}

          {/* Add new item to pending */}
          <div className="note-editor-checklist-add">
            <Plus size={18} />
            <input
              ref={newItemInputRef}
              type="text"
              placeholder="Ajouter un élément"
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (newItemText.trim()) {
                    setPendingItems(prev => [
                      ...(prev ?? []),
                      { text: newItemText.trim(), checked: false, order: prev?.length ?? 0 }
                    ]);
                    setNewItemText('');
                  }
                }
              }}
            />
          </div>
        </div>
      )}

      {/* Checklist for new note (before saving) */}
      {type === 'checklist' && !note && !pendingItems && (
        <div className="note-editor-checklist-placeholder">
          <p>Enregistrez la note pour ajouter des éléments</p>
        </div>
      )}

      {/* Bottom toolbar */}
      <div className="note-editor-toolbar">
        {/* Type toggle */}
        <button
          className="note-editor-tool"
          onClick={handleTypeToggle}
          title={type === 'note' ? 'Convertir en checklist' : 'Convertir en note'}
        >
          {type === 'note' ? <CheckSquare size={20} /> : <StickyNote size={20} />}
        </button>

        {/* Color picker */}
        <div className="note-editor-colors">
          {NOTE_COLORS.map((c) => (
            <button
              key={c}
              className={`note-editor-color ${color === c ? 'selected' : ''}`}
              style={{ backgroundColor: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>

        {/* Label picker */}
        <div className="note-editor-label-picker">
          <button
            className="note-editor-tool"
            onClick={() => setShowLabelPicker(!showLabelPicker)}
          >
            Labels ({selectedLabels.length})
          </button>
          {showLabelPicker && (
            <div className="note-editor-label-dropdown">
              {labels.length === 0 ? (
                <p className="note-editor-no-labels">Aucun label disponible</p>
              ) : (
                labels.map((label) => (
                  <button
                    key={label._id}
                    className={`note-editor-label-option ${selectedLabels.includes(label._id) ? 'selected' : ''}`}
                    onClick={() => toggleLabel(label._id)}
                  >
                    <span
                      className="label-dot"
                      style={{ backgroundColor: label.color }}
                    />
                    {label.name}
                    {selectedLabels.includes(label._id) && <Check size={14} />}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Selected labels display */}
      {selectedLabels.length > 0 && (
        <div className="note-editor-selected-labels">
          {selectedLabels.map((labelId) => {
            const label = labels.find(l => l._id === labelId);
            if (!label) return null;
            return (
              <LabelChip
                key={label._id}
                label={label}
                onRemove={() => toggleLabel(label._id)}
              />
            );
          })}
        </div>
      )}

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <div className="note-editor-dialog-overlay">
          <div className="note-editor-dialog">
            <h3>Supprimer la note ?</h3>
            <p>Cette action est irréversible.</p>
            <div className="note-editor-dialog-actions">
              <button onClick={() => setShowDeleteConfirm(false)}>
                Annuler
              </button>
              <button className="danger" onClick={handleDelete}>
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
