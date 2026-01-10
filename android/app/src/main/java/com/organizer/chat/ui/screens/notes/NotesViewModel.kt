package com.organizer.chat.ui.screens.notes

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.organizer.chat.data.model.Label
import com.organizer.chat.data.model.Note
import com.organizer.chat.data.model.UpdateNoteRequest
import com.organizer.chat.data.repository.NoteRepository
import com.organizer.chat.data.socket.SocketManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class NotesUiState(
    val notes: List<Note> = emptyList(),
    val labels: List<Label> = emptyList(),
    val selectedLabelId: String? = null,
    val isLoading: Boolean = false,
    val errorMessage: String? = null
)

class NotesViewModel(
    private val noteRepository: NoteRepository,
    private val socketManager: SocketManager?
) : ViewModel() {

    private val _uiState = MutableStateFlow(NotesUiState())
    val uiState: StateFlow<NotesUiState> = _uiState.asStateFlow()

    init {
        loadNotes()
        loadLabels()
        observeSocketEvents()
        observeConnectionState()
        socketManager?.subscribeToNotes()
    }

    private fun observeConnectionState() {
        socketManager?.let { manager ->
            viewModelScope.launch {
                var wasConnected = manager.isConnected()
                manager.connectionState.collect { state ->
                    if (state is com.organizer.chat.data.socket.ConnectionState.Connected) {
                        // Re-subscribe to notes when socket reconnects
                        manager.subscribeToNotes()
                        // Reload notes to catch any updates missed while disconnected
                        if (!wasConnected) {
                            loadNotes()
                            loadLabels()
                        }
                        wasConnected = true
                    } else if (state is com.organizer.chat.data.socket.ConnectionState.Disconnected) {
                        wasConnected = false
                    }
                }
            }
        }
    }

    private fun observeSocketEvents() {
        socketManager?.let { manager ->
            viewModelScope.launch {
                manager.noteCreated.collect { event ->
                    // Reload notes when a new note is created
                    loadNotes()
                }
            }
            viewModelScope.launch {
                manager.noteUpdated.collect { event ->
                    // Reload notes when a note is updated
                    loadNotes()
                }
            }
            viewModelScope.launch {
                manager.noteDeleted.collect { event ->
                    // Remove deleted note from list
                    _uiState.value = _uiState.value.copy(
                        notes = _uiState.value.notes.filter { it.id != event.noteId }
                    )
                }
            }
            viewModelScope.launch {
                manager.labelCreated.collect { event ->
                    loadLabels()
                }
            }
            viewModelScope.launch {
                manager.labelUpdated.collect { event ->
                    loadLabels()
                }
            }
            viewModelScope.launch {
                manager.labelDeleted.collect { event ->
                    _uiState.value = _uiState.value.copy(
                        labels = _uiState.value.labels.filter { it.id != event.labelId }
                    )
                    // If the deleted label was selected, clear the filter
                    if (_uiState.value.selectedLabelId == event.labelId) {
                        _uiState.value = _uiState.value.copy(selectedLabelId = null)
                        loadNotes()
                    }
                }
            }
        }
    }

    fun loadNotes() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            val result = noteRepository.getNotes(labelId = _uiState.value.selectedLabelId)
            result.fold(
                onSuccess = { notes ->
                    _uiState.value = _uiState.value.copy(
                        notes = notes,
                        isLoading = false
                    )
                },
                onFailure = { error ->
                    _uiState.value = _uiState.value.copy(
                        errorMessage = error.message ?: "Erreur lors du chargement",
                        isLoading = false
                    )
                }
            )
        }
    }

    fun loadLabels() {
        viewModelScope.launch {
            val result = noteRepository.getLabels()
            result.fold(
                onSuccess = { labels ->
                    _uiState.value = _uiState.value.copy(labels = labels)
                },
                onFailure = { /* Ignore label loading errors */ }
            )
        }
    }

    fun filterByLabel(labelId: String?) {
        _uiState.value = _uiState.value.copy(selectedLabelId = labelId)
        loadNotes()
    }

    fun togglePin(note: Note) {
        viewModelScope.launch {
            val result = noteRepository.patchNote(
                note.id,
                UpdateNoteRequest(isPinned = !note.isPinned)
            )
            result.fold(
                onSuccess = { updatedNote ->
                    _uiState.value = _uiState.value.copy(
                        notes = _uiState.value.notes.map {
                            if (it.id == updatedNote.id) updatedNote else it
                        }
                    )
                },
                onFailure = { /* Handle error */ }
            )
        }
    }

    fun toggleChecklistItem(note: Note, itemId: String, checked: Boolean) {
        viewModelScope.launch {
            val result = noteRepository.toggleChecklistItem(note.id, itemId, checked)
            result.fold(
                onSuccess = { updatedNote ->
                    _uiState.value = _uiState.value.copy(
                        notes = _uiState.value.notes.map {
                            if (it.id == updatedNote.id) updatedNote else it
                        }
                    )
                },
                onFailure = { /* Handle error */ }
            )
        }
    }

    fun deleteNote(noteId: String) {
        viewModelScope.launch {
            val result = noteRepository.deleteNote(noteId)
            result.fold(
                onSuccess = {
                    _uiState.value = _uiState.value.copy(
                        notes = _uiState.value.notes.filter { it.id != noteId }
                    )
                },
                onFailure = { /* Handle error */ }
            )
        }
    }

    override fun onCleared() {
        socketManager?.unsubscribeFromNotes()
        super.onCleared()
    }
}
