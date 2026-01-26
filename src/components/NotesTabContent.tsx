import { useState, useCallback } from "react";
import { NotesList, NoteEditor, LabelManager } from "./Notes";
import { Note, Label } from "../types";
import { UpdateNoteRequest, CreateNoteRequest } from "../services/api";

interface NotesTabContentProps {
  notes: Note[];
  labels: Label[];
  selectedNote: Note | null;
  selectedLabelId: string | null;
  isLoading: boolean;
  error: string | null;
  loadNotes: () => void;
  selectNote: (noteId: string | null) => void;
  createNote: (data: CreateNoteRequest) => Promise<Note | null>;
  updateNote: (noteId: string, data: UpdateNoteRequest) => Promise<Note | null>;
  deleteNote: (noteId: string) => Promise<boolean>;
  togglePin: (noteId: string) => Promise<boolean>;
  toggleChecklistItem: (noteId: string, itemId: string) => Promise<boolean>;
  addChecklistItem: (noteId: string, text: string) => Promise<boolean>;
  updateChecklistItemText: (noteId: string, itemId: string, text: string) => Promise<boolean>;
  deleteChecklistItem: (noteId: string, itemId: string) => Promise<boolean>;
  filterByLabel: (labelId: string | null) => void;
  createLabel: (name: string, color?: string) => Promise<Label | null>;
  updateLabel: (labelId: string, data: { name?: string; color?: string }) => Promise<Label | null>;
  deleteLabel: (labelId: string) => Promise<boolean>;
}

export function NotesTabContent({
  notes,
  labels,
  selectedNote,
  selectedLabelId,
  isLoading,
  error,
  loadNotes,
  selectNote,
  createNote,
  updateNote,
  deleteNote,
  togglePin,
  toggleChecklistItem,
  addChecklistItem,
  updateChecklistItemText,
  deleteChecklistItem,
  filterByLabel,
  createLabel,
  updateLabel,
  deleteLabel,
}: NotesTabContentProps) {
  // Notes view state
  const [notesView, setNotesView] = useState<'list' | 'editor' | 'labels'>('list');
  const [creatingNoteType, setCreatingNoteType] = useState<'note' | 'checklist'>('note');

  // Notes handlers
  const handleCreateNote = useCallback((type: 'note' | 'checklist') => {
    setCreatingNoteType(type);
    selectNote(null);
    setNotesView('editor');
  }, [selectNote]);

  const handleSelectNote = useCallback((noteId: string) => {
    selectNote(noteId);
    setNotesView('editor');
  }, [selectNote]);

  const handleSaveNote = useCallback(async (noteId: string | null, data: UpdateNoteRequest) => {
    if (noteId) {
      await updateNote(noteId, data);
    } else {
      const newNote = await createNote({
        type: data.type || creatingNoteType,
        title: data.title,
        content: data.content,
        color: data.color,
        labels: data.labels,
        assignedTo: data.assignedTo,
      });
      if (newNote) {
        selectNote(newNote._id);
      }
    }
  }, [updateNote, createNote, creatingNoteType, selectNote]);

  const handleDeleteNoteFromEditor = useCallback(async (noteId: string) => {
    await deleteNote(noteId);
    setNotesView('list');
  }, [deleteNote]);

  const handleCloseNoteEditor = useCallback(() => {
    selectNote(null);
    setNotesView('list');
  }, [selectNote]);

  return (
    <div className="notes-tab-content">
      {notesView === 'list' && (
        <NotesList
          notes={notes}
          labels={labels}
          selectedLabelId={selectedLabelId}
          isLoading={isLoading}
          error={error}
          onSelectNote={handleSelectNote}
          onCreateNote={handleCreateNote}
          onTogglePin={togglePin}
          onDeleteNote={deleteNote}
          onToggleChecklistItem={toggleChecklistItem}
          onFilterByLabel={filterByLabel}
          onRefresh={loadNotes}
          onManageLabels={() => setNotesView('labels')}
        />
      )}
      {notesView === 'editor' && (
        <NoteEditor
          note={selectedNote}
          labels={labels}
          isCreating={!selectedNote}
          initialType={creatingNoteType}
          onSave={handleSaveNote}
          onDelete={handleDeleteNoteFromEditor}
          onClose={handleCloseNoteEditor}
          onToggleChecklistItem={toggleChecklistItem}
          onAddChecklistItem={addChecklistItem}
          onUpdateChecklistItemText={updateChecklistItemText}
          onDeleteChecklistItem={deleteChecklistItem}
        />
      )}
      {notesView === 'labels' && (
        <LabelManager
          labels={labels}
          onCreateLabel={createLabel}
          onUpdateLabel={updateLabel}
          onDeleteLabel={deleteLabel}
          onClose={() => setNotesView('list')}
        />
      )}
    </div>
  );
}
