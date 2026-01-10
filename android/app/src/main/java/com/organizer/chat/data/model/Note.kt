package com.organizer.chat.data.model

import com.google.gson.annotations.SerializedName

data class Note(
    @SerializedName("_id", alternate = ["id"])
    val id: String,
    val type: String = "note",  // "note" or "checklist"
    val title: String = "",
    val content: String = "",
    val items: List<ChecklistItem> = emptyList(),
    val color: String = "#1a1a1a",
    val labels: List<Label> = emptyList(),
    val assignedTo: UserRef? = null,
    val createdBy: UserRef,
    val order: Double = 0.0,
    val isPinned: Boolean = false,
    val isArchived: Boolean = false,
    val createdAt: String,
    val updatedAt: String? = null
)

data class ChecklistItem(
    @SerializedName("_id", alternate = ["id"])
    val id: String,
    val text: String,
    val checked: Boolean = false,
    val order: Int = 0
)

data class Label(
    @SerializedName("_id", alternate = ["id"])
    val id: String,
    val name: String,
    val color: String = "#808080"
)

// API Responses
data class NotesResponse(
    val notes: List<Note>
)

data class NoteResponse(
    val note: Note
)

data class LabelsResponse(
    val labels: List<Label>
)

data class LabelResponse(
    val label: Label
)

// API Requests
data class CreateNoteRequest(
    val type: String = "note",
    val title: String = "",
    val content: String = "",
    val items: List<CreateChecklistItemRequest> = emptyList(),
    val color: String = "#1a1a1a",
    val labels: List<String> = emptyList(),
    val assignedTo: String? = null
)

data class CreateChecklistItemRequest(
    val text: String
)

data class UpdateNoteRequest(
    val type: String? = null,
    val title: String? = null,
    val content: String? = null,
    val items: List<UpdateChecklistItemRequest>? = null,
    val color: String? = null,
    val labels: List<String>? = null,
    val assignedTo: String? = null,
    val isPinned: Boolean? = null,
    val isArchived: Boolean? = null
)

data class UpdateChecklistItemRequest(
    @SerializedName("_id")
    val id: String? = null,
    val text: String,
    val checked: Boolean = false,
    val order: Int
)

data class PatchChecklistItemRequest(
    val text: String? = null,
    val checked: Boolean? = null
)

data class AddChecklistItemRequest(
    val text: String
)

data class ReorderNoteRequest(
    val noteId: String,
    val newOrder: Double
)

data class ReorderItemsRequest(
    val items: List<ReorderItemRequest>
)

data class ReorderItemRequest(
    @SerializedName("_id")
    val id: String,
    val order: Int
)

data class CreateLabelRequest(
    val name: String,
    val color: String = "#808080"
)

data class UpdateLabelRequest(
    val name: String? = null,
    val color: String? = null
)

data class SuccessResponse(
    val success: Boolean
)
