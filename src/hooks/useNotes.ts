import { useState, useEffect, useCallback } from 'react';
import { api, Note, Label, CreateNoteRequest, UpdateNoteRequest } from '../services/api';
import { socketService } from '../services/socket';

interface UseNotesOptions {
  enabled?: boolean;
}

export const useNotes = (options: UseNotesOptions = {}) => {
  const { enabled = true } = options;
  // Notes state
  const [notes, setNotes] = useState<Note[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load notes
  const loadNotes = useCallback(async (labelId?: string | null) => {
    try {
      setIsLoading(true);
      setError(null);
      const { notes: fetchedNotes } = await api.getNotes(false, labelId || undefined);
      setNotes(fetchedNotes);
    } catch (err) {
      console.error('Failed to load notes:', err);
      setError(err instanceof Error ? err.message : 'Failed to load notes');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load labels
  const loadLabels = useCallback(async () => {
    try {
      const { labels: fetchedLabels } = await api.getLabels();
      setLabels(fetchedLabels);
    } catch (err) {
      console.error('Failed to load labels:', err);
    }
  }, []);

  // Initial load - only when enabled
  useEffect(() => {
    if (!enabled) return;

    loadNotes();
    loadLabels();
    socketService.subscribeToNotes();

    // Re-subscribe and reload on socket reconnection
    const unsubReconnect = socketService.on('internal:connected', () => {
      console.log('Socket reconnected, re-subscribing to notes');
      socketService.subscribeToNotes();
      loadNotes();
      loadLabels();
    });

    return () => {
      socketService.unsubscribeFromNotes();
      unsubReconnect();
    };
  }, [enabled, loadNotes, loadLabels]);

  // Listen for note events - only when enabled
  useEffect(() => {
    if (!enabled) return;

    const unsubCreated = socketService.on('note:created', () => {
      loadNotes(selectedLabelId);
    });

    const unsubUpdated = socketService.on('note:updated', (data: any) => {
      const updatedNote = data.note;
      if (!updatedNote) return;

      // Update the specific note in local state (without reloading everything)
      setNotes(prev => prev.map(n => n._id === updatedNote._id ? updatedNote : n));

      // Update selected note if it's the one being edited
      if (selectedNote && updatedNote._id === selectedNote._id) {
        setSelectedNote(updatedNote);
      }
    });

    const unsubDeleted = socketService.on('note:deleted', (data: any) => {
      // Clear selection if deleted note was selected
      if (selectedNote && data.noteId === selectedNote._id) {
        setSelectedNote(null);
      }
      // Remove from local state
      setNotes(prev => prev.filter(n => n._id !== data.noteId));
    });

    return () => {
      unsubCreated();
      unsubUpdated();
      unsubDeleted();
    };
  }, [enabled, selectedLabelId, selectedNote, loadNotes]);

  // Listen for label events - only when enabled
  useEffect(() => {
    if (!enabled) return;

    const unsubLabelCreated = socketService.on('label:created', () => {
      loadLabels();
    });

    const unsubLabelUpdated = socketService.on('label:updated', () => {
      loadLabels();
      loadNotes(selectedLabelId);
    });

    const unsubLabelDeleted = socketService.on('label:deleted', (data: any) => {
      // Clear filter if deleted label was selected
      if (selectedLabelId === data.labelId) {
        setSelectedLabelId(null);
      }
      loadLabels();
      loadNotes(selectedLabelId === data.labelId ? null : selectedLabelId);
    });

    return () => {
      unsubLabelCreated();
      unsubLabelUpdated();
      unsubLabelDeleted();
    };
  }, [enabled, selectedLabelId, loadLabels, loadNotes]);

  // Filter by label
  const filterByLabel = useCallback((labelId: string | null) => {
    setSelectedLabelId(labelId);
    loadNotes(labelId);
  }, [loadNotes]);

  // Select a note for editing
  const selectNote = useCallback((noteId: string | null) => {
    if (!noteId) {
      setSelectedNote(null);
      return;
    }
    const note = notes.find(n => n._id === noteId);
    setSelectedNote(note || null);
  }, [notes]);

  // Create a new note
  const createNote = useCallback(async (data: CreateNoteRequest): Promise<Note | null> => {
    try {
      setError(null);
      const { note } = await api.createNote(data);
      setNotes(prev => [note, ...prev]);
      return note;
    } catch (err) {
      console.error('Failed to create note:', err);
      setError(err instanceof Error ? err.message : 'Failed to create note');
      return null;
    }
  }, []);

  // Update a note
  const updateNote = useCallback(async (noteId: string, data: UpdateNoteRequest): Promise<Note | null> => {
    try {
      setError(null);
      const { note } = await api.updateNote(noteId, data);
      setNotes(prev => prev.map(n => n._id === noteId ? note : n));
      if (selectedNote?._id === noteId) {
        setSelectedNote(note);
      }
      return note;
    } catch (err) {
      console.error('Failed to update note:', err);
      setError(err instanceof Error ? err.message : 'Failed to update note');
      return null;
    }
  }, [selectedNote]);

  // Patch a note (partial update)
  const patchNote = useCallback(async (noteId: string, data: Partial<UpdateNoteRequest>): Promise<Note | null> => {
    try {
      setError(null);
      const { note } = await api.patchNote(noteId, data);
      setNotes(prev => prev.map(n => n._id === noteId ? note : n));
      if (selectedNote?._id === noteId) {
        setSelectedNote(note);
      }
      return note;
    } catch (err) {
      console.error('Failed to patch note:', err);
      setError(err instanceof Error ? err.message : 'Failed to update note');
      return null;
    }
  }, [selectedNote]);

  // Delete a note
  const deleteNote = useCallback(async (noteId: string): Promise<boolean> => {
    try {
      setError(null);
      await api.deleteNote(noteId);
      setNotes(prev => prev.filter(n => n._id !== noteId));
      if (selectedNote?._id === noteId) {
        setSelectedNote(null);
      }
      return true;
    } catch (err) {
      console.error('Failed to delete note:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete note');
      return false;
    }
  }, [selectedNote]);

  // Toggle pin
  const togglePin = useCallback(async (noteId: string): Promise<boolean> => {
    const note = notes.find(n => n._id === noteId);
    if (!note) return false;

    const result = await patchNote(noteId, { isPinned: !note.isPinned });
    return result !== null;
  }, [notes, patchNote]);

  // Toggle checklist item
  const toggleChecklistItem = useCallback(async (noteId: string, itemId: string): Promise<boolean> => {
    try {
      const note = notes.find(n => n._id === noteId);
      if (!note) return false;

      const item = note.items.find(i => i._id === itemId);
      if (!item) return false;

      const { note: updatedNote } = await api.updateChecklistItem(noteId, itemId, { checked: !item.checked });
      setNotes(prev => prev.map(n => n._id === noteId ? updatedNote : n));
      if (selectedNote?._id === noteId) {
        setSelectedNote(updatedNote);
      }
      return true;
    } catch (err) {
      console.error('Failed to toggle checklist item:', err);
      return false;
    }
  }, [notes, selectedNote]);

  // Add checklist item
  const addChecklistItem = useCallback(async (noteId: string, text: string): Promise<boolean> => {
    try {
      const { note: updatedNote } = await api.addChecklistItem(noteId, text);
      setNotes(prev => prev.map(n => n._id === noteId ? updatedNote : n));
      if (selectedNote?._id === noteId) {
        setSelectedNote(updatedNote);
      }
      return true;
    } catch (err) {
      console.error('Failed to add checklist item:', err);
      return false;
    }
  }, [selectedNote]);

  // Update checklist item text
  const updateChecklistItemText = useCallback(async (noteId: string, itemId: string, text: string): Promise<boolean> => {
    try {
      const { note: updatedNote } = await api.updateChecklistItem(noteId, itemId, { text });
      setNotes(prev => prev.map(n => n._id === noteId ? updatedNote : n));
      if (selectedNote?._id === noteId) {
        setSelectedNote(updatedNote);
      }
      return true;
    } catch (err) {
      console.error('Failed to update checklist item:', err);
      return false;
    }
  }, [selectedNote]);

  // Delete checklist item
  const deleteChecklistItem = useCallback(async (noteId: string, itemId: string): Promise<boolean> => {
    try {
      const { note: updatedNote } = await api.deleteChecklistItem(noteId, itemId);
      setNotes(prev => prev.map(n => n._id === noteId ? updatedNote : n));
      if (selectedNote?._id === noteId) {
        setSelectedNote(updatedNote);
      }
      return true;
    } catch (err) {
      console.error('Failed to delete checklist item:', err);
      return false;
    }
  }, [selectedNote]);

  // Create a label
  const createLabel = useCallback(async (name: string, color?: string): Promise<Label | null> => {
    try {
      setError(null);
      const { label } = await api.createLabel(name, color);
      setLabels(prev => [...prev, label]);
      return label;
    } catch (err) {
      console.error('Failed to create label:', err);
      setError(err instanceof Error ? err.message : 'Failed to create label');
      return null;
    }
  }, []);

  // Update a label
  const updateLabel = useCallback(async (labelId: string, data: { name?: string; color?: string }): Promise<Label | null> => {
    try {
      setError(null);
      const { label } = await api.updateLabel(labelId, data);
      setLabels(prev => prev.map(l => l._id === labelId ? label : l));
      return label;
    } catch (err) {
      console.error('Failed to update label:', err);
      setError(err instanceof Error ? err.message : 'Failed to update label');
      return null;
    }
  }, []);

  // Delete a label
  const deleteLabel = useCallback(async (labelId: string): Promise<boolean> => {
    try {
      setError(null);
      await api.deleteLabel(labelId);
      setLabels(prev => prev.filter(l => l._id !== labelId));
      if (selectedLabelId === labelId) {
        setSelectedLabelId(null);
        loadNotes(null);
      }
      return true;
    } catch (err) {
      console.error('Failed to delete label:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete label');
      return false;
    }
  }, [selectedLabelId, loadNotes]);

  return {
    // State
    notes,
    labels,
    selectedNote,
    selectedLabelId,
    isLoading,
    error,

    // Notes methods
    loadNotes,
    selectNote,
    createNote,
    updateNote,
    patchNote,
    deleteNote,
    togglePin,

    // Checklist methods
    toggleChecklistItem,
    addChecklistItem,
    updateChecklistItemText,
    deleteChecklistItem,

    // Labels methods
    loadLabels,
    filterByLabel,
    createLabel,
    updateLabel,
    deleteLabel,
  };
};
