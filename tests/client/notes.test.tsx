import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NoteEditor } from '../../src/components/Notes/NoteEditor';
import { NotesTabContent } from '../../src/components/NotesTabContent';
import type { Note } from '../../src/services/api';

const note: Note = {
  _id: 'note', title: 'Original title', content: 'Original content', type: 'checklist',
  color: '#1a1a1a', labels: [], isPinned: false, isArchived: false, order: 0,
  assignedTo: null, createdBy: { _id: 'user', username: 'User' },
  createdAt: '2026-09-06T00:00:00Z', updatedAt: '2026-09-06T00:00:00Z',
  items: [{ _id: 'one', text: 'First item', checked: false, order: 0 },
    { _id: 'two', text: 'Second item', checked: false, order: 1 }],
};

function editorProps() {
  return {
    note, labels: [], isCreating: false,
    onSave: vi.fn().mockResolvedValue(note), onDelete: vi.fn(), onClose: vi.fn(),
    onAddChecklistItem: vi.fn().mockResolvedValue(true),
    onUpdateChecklistItemText: vi.fn().mockResolvedValue(true),
    onToggleChecklistItem: vi.fn().mockResolvedValue(true),
    onDeleteChecklistItem: vi.fn().mockResolvedValue(true),
  };
}

describe('note drafts and checklist saves', () => {
  it('preserves edited fields when a checklist/server update replaces the note', () => {
    const props = editorProps();
    const { rerender } = render(<NoteEditor {...props} />);
    fireEvent.change(screen.getByPlaceholderText('Titre'), { target: { value: 'My draft' } });
    rerender(<NoteEditor {...props} note={{ ...note, color: '#345920', items: note.items.map(i => ({ ...i, checked: true })) }} />);
    expect(screen.getByDisplayValue('My draft')).toBeTruthy();
    expect(document.querySelector('.note-editor')?.getAttribute('style')).toContain('rgb(52, 89, 32)');
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it('saves both rows edited within the debounce period', async () => {
    vi.useFakeTimers();
    const props = editorProps();
    render(<NoteEditor {...props} />);
    fireEvent.change(screen.getByDisplayValue('First item'), { target: { value: 'Changed first' } });
    fireEvent.change(screen.getByDisplayValue('Second item'), { target: { value: 'Changed second' } });
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(props.onUpdateChecklistItemText.mock.calls).toEqual([
      ['note', 'one', 'Changed first'], ['note', 'two', 'Changed second'],
    ]);
  });

  it('flushes pending row saves before closing and does not send them twice', async () => {
    vi.useFakeTimers();
    const props = editorProps();
    render(<NoteEditor {...props} />);
    fireEvent.change(screen.getByDisplayValue('First item'), { target: { value: 'Last edit' } });
    await act(async () => { fireEvent.click(document.querySelector('.note-editor-back')!); });
    expect(props.onUpdateChecklistItemText).toHaveBeenCalledWith('note', 'one', 'Last edit');
    expect(props.onClose).toHaveBeenCalledOnce();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(props.onUpdateChecklistItemText).toHaveBeenCalledOnce();
  });

  it('keeps the editor and draft when saving fails', async () => {
    const props = editorProps();
    props.onSave.mockResolvedValue(null);
    render(<NoteEditor {...props} />);
    fireEvent.change(screen.getByPlaceholderText('Titre'), { target: { value: 'Keep me' } });
    fireEvent.click(document.querySelector('.note-editor-back')!);
    await screen.findByRole('alert');
    expect(props.onClose).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('Keep me')).toBeTruthy();
    props.onSave.mockResolvedValue(note);
    fireEvent.click(document.querySelector('.note-editor-back')!);
    await waitFor(() => expect(props.onClose).toHaveBeenCalledOnce());
  });

  it('serializes successive edits of one row while a save is in flight', async () => {
    vi.useFakeTimers();
    const props = editorProps();
    let finishFirst!: (success: boolean) => void;
    props.onUpdateChecklistItemText.mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve; }));
    render(<NoteEditor {...props} />);
    fireEvent.change(screen.getByDisplayValue('First item'), { target: { value: 'First edit' } });
    await act(() => vi.advanceTimersByTimeAsync(500));
    fireEvent.change(screen.getByDisplayValue('First edit'), { target: { value: 'Latest edit' } });
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(props.onUpdateChecklistItemText).toHaveBeenCalledTimes(1);
    await act(async () => { finishFirst(true); });
    expect(props.onUpdateChecklistItemText.mock.calls).toEqual([
      ['note', 'one', 'First edit'], ['note', 'one', 'Latest edit'],
    ]);
    expect(screen.getByDisplayValue('Latest edit')).toBeTruthy();
  });

  it('retries a failed checklist save before allowing close', async () => {
    const props = editorProps();
    props.onUpdateChecklistItemText.mockResolvedValueOnce(false);
    render(<NoteEditor {...props} />);
    fireEvent.change(screen.getByDisplayValue('First item'), { target: { value: 'Unsaved item' } });
    fireEvent.click(document.querySelector('.note-editor-back')!);
    await screen.findByRole('alert');
    expect(props.onClose).not.toHaveBeenCalled();
    fireEvent.click(document.querySelector('.note-editor-back')!);
    await waitFor(() => expect(props.onClose).toHaveBeenCalledOnce());
    expect(props.onUpdateChecklistItemText).toHaveBeenCalledTimes(2);
  });

  it('does not send a queued edit after its row is deleted', async () => {
    vi.useFakeTimers();
    const props = editorProps();
    render(<NoteEditor {...props} />);
    const input = screen.getByDisplayValue('First item');
    fireEvent.change(input, { target: { value: 'Discarded edit' } });
    await act(async () => { fireEvent.click(input.parentElement!.querySelector('.checklist-item-delete')!); });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(props.onDeleteChecklistItem).toHaveBeenCalledWith('note', 'one');
    expect(props.onUpdateChecklistItemText).not.toHaveBeenCalled();
  });

  it('retains the editor and draft across tab changes', () => {
    const props = {
      notes: [note], labels: [], selectedNote: note, selectedLabelId: null,
      isLoading: false, error: null, loadNotes: vi.fn(), selectNote: vi.fn(),
      createNote: vi.fn(), updateNote: vi.fn(), deleteNote: vi.fn(), togglePin: vi.fn(),
      toggleChecklistItem: vi.fn(), addChecklistItem: vi.fn(), updateChecklistItemText: vi.fn(),
      deleteChecklistItem: vi.fn(), filterByLabel: vi.fn(), createLabel: vi.fn(),
      updateLabel: vi.fn(), deleteLabel: vi.fn(),
    };
    const { rerender } = render(<NotesTabContent {...props} isActive />);
    fireEvent.click(screen.getByText('Original title'));
    fireEvent.change(screen.getByPlaceholderText('Titre'), { target: { value: 'Unfinished draft' } });
    rerender(<NotesTabContent {...props} isActive={false} />);
    expect(document.querySelector('.notes-tab-content')?.getAttribute('style')).toContain('display: none');
    rerender(<NotesTabContent {...props} isActive />);
    expect(screen.getByDisplayValue('Unfinished draft')).toBeTruthy();
  });
});
