package com.organizer.chat.data.repository

import com.organizer.chat.data.api.ApiClient
import com.organizer.chat.data.model.*

class NoteRepository {
    private val api = ApiClient.getService()

    // Notes
    suspend fun getNotes(labelId: String? = null, archived: Boolean = false): Result<List<Note>> {
        return try {
            val response = api.getNotes(labelId = labelId, archived = archived)
            Result.success(response.notes)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getNote(noteId: String): Result<Note> {
        return try {
            val response = api.getNote(noteId)
            Result.success(response.note)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun createNote(
        type: String = "note",
        title: String = "",
        content: String = "",
        items: List<String> = emptyList(),
        color: String = "#ffffff",
        labels: List<String> = emptyList(),
        assignedTo: String? = null
    ): Result<Note> {
        return try {
            val request = CreateNoteRequest(
                type = type,
                title = title,
                content = content,
                items = items.map { CreateChecklistItemRequest(text = it) },
                color = color,
                labels = labels,
                assignedTo = assignedTo
            )
            val response = api.createNote(request)
            Result.success(response.note)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun updateNote(noteId: String, request: UpdateNoteRequest): Result<Note> {
        return try {
            val response = api.updateNote(noteId, request)
            Result.success(response.note)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun patchNote(noteId: String, request: UpdateNoteRequest): Result<Note> {
        return try {
            val response = api.patchNote(noteId, request)
            Result.success(response.note)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun deleteNote(noteId: String): Result<Unit> {
        return try {
            api.deleteNote(noteId)
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun reorderNote(noteId: String, newOrder: Double): Result<Unit> {
        return try {
            api.reorderNote(ReorderNoteRequest(noteId = noteId, newOrder = newOrder))
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    // Checklist items
    suspend fun addChecklistItem(noteId: String, text: String): Result<Note> {
        return try {
            val response = api.addChecklistItem(noteId, AddChecklistItemRequest(text = text))
            Result.success(response.note)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun toggleChecklistItem(noteId: String, itemId: String, checked: Boolean): Result<Note> {
        return try {
            val response = api.patchChecklistItem(
                noteId,
                itemId,
                PatchChecklistItemRequest(checked = checked)
            )
            Result.success(response.note)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun updateChecklistItemText(noteId: String, itemId: String, text: String): Result<Note> {
        return try {
            val response = api.patchChecklistItem(
                noteId,
                itemId,
                PatchChecklistItemRequest(text = text)
            )
            Result.success(response.note)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun deleteChecklistItem(noteId: String, itemId: String): Result<Note> {
        return try {
            val response = api.deleteChecklistItem(noteId, itemId)
            Result.success(response.note)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun reorderChecklistItems(noteId: String, items: List<ReorderItemRequest>): Result<Note> {
        return try {
            val response = api.reorderChecklistItems(noteId, ReorderItemsRequest(items = items))
            Result.success(response.note)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    // Labels
    suspend fun getLabels(): Result<List<Label>> {
        return try {
            val response = api.getLabels()
            Result.success(response.labels)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun createLabel(name: String, color: String = "#808080"): Result<Label> {
        return try {
            val response = api.createLabel(CreateLabelRequest(name = name, color = color))
            Result.success(response.label)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun updateLabel(labelId: String, name: String? = null, color: String? = null): Result<Label> {
        return try {
            val response = api.updateLabel(labelId, UpdateLabelRequest(name = name, color = color))
            Result.success(response.label)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun deleteLabel(labelId: String): Result<Unit> {
        return try {
            api.deleteLabel(labelId)
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
