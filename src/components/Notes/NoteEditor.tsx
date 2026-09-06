import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Copy,
} from 'lucide-react';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { Note, Label, UpdateNoteRequest } from '../../services/api';
import { LabelChip } from './LabelChip';

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
  onSave: (noteId: string | null, data: UpdateNoteRequest) => Promise<Note | null>;
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
  // Only locally edited fields override the server snapshot. Checklist/socket
  // responses can update untouched fields without replacing the user's draft.
  // NotesTabContent keys this editor by note ID to start a new draft on selection.
  const [draft, setDraft] = useState<UpdateNoteRequest>({});
  const title = draft.title ?? note?.title ?? '';
  const content = draft.content ?? note?.content ?? '';
  const type = draft.type ?? note?.type ?? initialType;
  const color = draft.color ?? note?.color ?? NOTE_COLORS[0];
  const selectedLabels = draft.labels ?? note?.labels.map(l => l._id) ?? [];
  const isPinned = draft.isPinned ?? note?.isPinned ?? false;
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLabelPicker, setShowLabelPicker] = useState(false);
  const [newItemText, setNewItemText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Local state for checklist item texts (to handle debouncing)
  const [localItemTexts, setLocalItemTexts] = useState<Record<string, string>>({});
  // Pending items for type conversion (note → checklist)
  const [pendingItems, setPendingItems] = useState<{ text: string; checked: boolean; order: number }[] | null>(null);
  const hasChanges = Object.keys(draft).length > 0 || pendingItems !== null;
  // Copy success feedback
  const [showCopySuccess, setShowCopySuccess] = useState(false);

  const newItemInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const itemTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pendingItemSavesRef = useRef(new Map<string, () => Promise<boolean>>());
  const itemRequestsRef = useRef(new Map<string, Promise<boolean>>());
  const activeItemSavesRef = useRef(new Map<string, () => Promise<boolean>>());
  const savingRef = useRef(false);

  const saveItem = useCallback((itemId: string) => {
    const save = pendingItemSavesRef.current.get(itemId);
    clearTimeout(itemTimersRef.current.get(itemId));
    itemTimersRef.current.delete(itemId);
    if (!save) return itemRequestsRef.current.get(itemId) ?? Promise.resolve(true);
    if (activeItemSavesRef.current.get(itemId) === save) return itemRequestsRef.current.get(itemId)!;
    // Serialize edits of the same item so an older request cannot win last.
    const previous = itemRequestsRef.current.get(itemId) ?? Promise.resolve(true);
    const request = previous.then(save).catch(() => false).then(success => {
      if (activeItemSavesRef.current.get(itemId) === save) activeItemSavesRef.current.delete(itemId);
      if (pendingItemSavesRef.current.get(itemId) === save) {
        if (success) pendingItemSavesRef.current.delete(itemId);
        else setSaveError('Impossible d’enregistrer la checklist. Réessayez avant de fermer.');
      }
      return success;
    });
    itemRequestsRef.current.set(itemId, request);
    activeItemSavesRef.current.set(itemId, save);
    return request;
  }, []);

  const flushItemSaves = useCallback(async () => {
    const results = await Promise.all(Array.from(pendingItemSavesRef.current.keys(), saveItem));
    return results.every(Boolean);
  }, [saveItem]);

  useEffect(() => {
    const timers = itemTimersRef.current;
    const pending = pendingItemSavesRef.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
      pending.clear();
    };
  }, []);

  // Focus title on create
  useEffect(() => {
    if (isCreating && titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, [isCreating]);

  // Handle save
  const handleSave = useCallback(async () => {
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
    return onSave(note?._id || null, data);
  }, [note, title, content, type, color, selectedLabels, isPinned, pendingItems, onSave]);

  // Auto-save on close
  const handleClose = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    setSaveError(null);
    try {
      if (!await flushItemSaves()) return;
      if (hasChanges && (note || title.trim() || content.trim() || pendingItems?.length)) {
        if (!await handleSave()) {
          setSaveError('Impossible d’enregistrer la note. Votre brouillon est conservé.');
          return;
        }
      }
      onClose();
    } catch {
      setSaveError('Impossible d’enregistrer la note. Votre brouillon est conservé.');
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  // Handle type toggle with data conversion and immediate save
  const handleTypeToggle = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    setSaveError(null);
    try {
      if (!await flushItemSaves()) return;
      let data: UpdateNoteRequest;
      if (type === 'checklist') {
        const newContent = pendingItems
          ? pendingItems.map(item => item.text).join('\n')
          : note?.items.map(item => localItemTexts[item._id] ?? item.text).join('\n') ?? content;
        data = { title, content: newContent, type: 'note', color, labels: selectedLabels, isPinned };
        setPendingItems(null);
      } else {
        const items = content.split('\n').filter(line => line.trim()).map((line, order) => ({
          text: line.trim(), checked: false, order,
        }));
        data = { title, content: '', type: 'checklist', color, labels: selectedLabels, isPinned, items };
        setPendingItems(items);
      }
      setDraft(data);
      if (note) {
        const saved = await onSave(note._id, data);
        if (saved) {
          setDraft({});
          setPendingItems(null);
          setLocalItemTexts({});
        } else {
          setSaveError('Impossible d’enregistrer la note. Votre brouillon est conservé.');
        }
      }
    } catch {
      setSaveError('Impossible d’enregistrer la note. Votre brouillon est conservé.');
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  // Handle label toggle
  const toggleLabel = (labelId: string) => {
    setDraft(prev => ({ ...prev, labels: selectedLabels.includes(labelId)
      ? selectedLabels.filter(id => id !== labelId)
      : [...selectedLabels, labelId] }));
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
    // Each row owns its timer; editing another row must not cancel this save.
    clearTimeout(itemTimersRef.current.get(itemId));
    pendingItemSavesRef.current.set(itemId, () => onUpdateChecklistItemText(note._id, itemId, text));
    itemTimersRef.current.set(itemId, setTimeout(() => { void saveItem(itemId); }, 500));
  };

  // Get item text (local if being edited, otherwise from note)
  const getItemText = (itemId: string, originalText: string): string => {
    return localItemTexts[itemId] !== undefined ? localItemTexts[itemId] : originalText;
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!note) return;
    // Discard a queued edit of the row being deleted. Wait for an already sent
    // edit so it cannot race the deletion or leave a failed save blocking close.
    clearTimeout(itemTimersRef.current.get(itemId));
    itemTimersRef.current.delete(itemId);
    pendingItemSavesRef.current.delete(itemId);
    await itemRequestsRef.current.get(itemId);
    await onDeleteChecklistItem(note._id, itemId);
  };

  // Handle delete confirmation
  const handleDelete = () => {
    if (note) {
      onDelete(note._id);
    }
  };

  // Format note content for clipboard
  const formatNoteForCopy = (): string => {
    if (type === 'note') {
      return content;
    } else if (type === 'checklist') {
      const items = pendingItems ?? note?.items ?? [];
      return items
        .filter(item => !item.checked)
        .map(item => typeof item === 'object' && 'text' in item ? item.text : '')
        .filter(text => text.trim() !== '')
        .join('\n');
    }
    return '';
  };

  // Handle copy to clipboard
  const handleCopyNote = async () => {
    const textToCopy = formatNoteForCopy();
    if (!textToCopy.trim()) return;

    try {
      await writeText(textToCopy);
      setShowCopySuccess(true);
      setTimeout(() => setShowCopySuccess(false), 2000);
    } catch {
      // Fallback to web clipboard API
      try {
        await navigator.clipboard.writeText(textToCopy);
        setShowCopySuccess(true);
        setTimeout(() => setShowCopySuccess(false), 2000);
      } catch {
        // Silent fail
      }
    }
  };

  return (
    <div className="note-editor" style={{ backgroundColor: color }} inert={isSaving} aria-busy={isSaving}>
      {saveError && <p role="alert">{saveError}</p>}
      {/* Header */}
      <div className="note-editor-header">
        <button className="note-editor-back" onClick={handleClose}>
          <ArrowLeft size={20} />
        </button>
        <div className="note-editor-header-actions">
          <button
            className={`note-editor-pin-btn ${isPinned ? 'active' : ''}`}
            onClick={() => setDraft(prev => ({ ...prev, isPinned: !isPinned }))}
          >
            <Pin size={18} />
          </button>
          <button
            className="note-editor-copy-btn"
            onClick={handleCopyNote}
            title="Copier"
          >
            <Copy size={18} />
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

      {/* Copy success toast */}
      {showCopySuccess && (
        <div className="note-editor-copy-toast">
          Copié !
        </div>
      )}

      {/* Title */}
      <input
        ref={titleInputRef}
        type="text"
        className="note-editor-title"
        placeholder="Titre"
        value={title}
        onChange={(e) => setDraft(prev => ({ ...prev, title: e.target.value }))}
      />

      {/* Content for note type */}
      {type === 'note' && (
        <textarea
          className="note-editor-content"
          placeholder="Commencez à écrire..."
          value={content}
          onChange={(e) => setDraft(prev => ({ ...prev, content: e.target.value }))}
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
                onClick={() => handleDeleteItem(item._id)}
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
              onClick={() => setDraft(prev => ({ ...prev, color: c }))}
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
