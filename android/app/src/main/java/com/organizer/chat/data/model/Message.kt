package com.organizer.chat.data.model

import com.google.gson.annotations.SerializedName

data class Message(
    @SerializedName("_id", alternate = ["id"])
    val id: String,
    val roomId: String,
    val senderId: MessageSender,
    val type: String = "text",  // "text", "image", "audio", "system", "file"
    val content: String,
    val caption: String? = null,  // Optional caption for image/file messages
    val fileName: String? = null,  // Original filename for file messages
    val fileSize: Long? = null,  // File size in bytes
    val mimeType: String? = null,  // MIME type (application/pdf, etc.)
    val fileDeleted: Boolean = false,  // True if the file was soft-deleted
    val status: String = "sent",  // "sent", "delivered", "read"
    val readBy: List<String> = emptyList(),
    val reactions: List<Reaction> = emptyList(),
    val clientSource: String? = null,  // "desktop", "android", "api"
    val createdAt: String,
    val updatedAt: String? = null
)

data class Reaction(
    val userId: String,
    val emoji: String,
    val createdAt: String
)

data class MessageSender(
    @SerializedName("_id", alternate = ["id"])
    val id: String,
    val username: String,
    val displayName: String,
    val status: String = "available",
    val statusMessage: String? = null,
    val isOnline: Boolean = false
)

data class MessagesResponse(
    val messages: List<Message>
)

data class SendMessageRequest(
    val roomId: String,
    val type: String = "text",
    val content: String,
    val clientSource: String = "android"
)

data class MessageResponse(
    val message: Message
)

data class ReactRequest(
    val emoji: String
)

data class ReactResponse(
    val message: Message,
    val action: String,
    val roomId: String
)
