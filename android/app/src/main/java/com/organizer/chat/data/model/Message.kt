package com.organizer.chat.data.model

import com.google.gson.annotations.SerializedName

data class Message(
    @SerializedName("_id", alternate = ["id"])
    val id: String,
    val roomId: String,
    val senderId: MessageSender,
    val type: String = "text",  // "text", "image", "audio", "system"
    val content: String,
    val status: String = "sent",  // "sent", "delivered", "read"
    val readBy: List<String> = emptyList(),
    val createdAt: String,
    val updatedAt: String? = null
)

data class MessageSender(
    @SerializedName("_id", alternate = ["id"])
    val id: String,
    val username: String,
    val displayName: String
)

data class MessagesResponse(
    val messages: List<Message>
)

data class SendMessageRequest(
    val roomId: String,
    val type: String = "text",
    val content: String
)

data class MessageResponse(
    val message: Message
)
