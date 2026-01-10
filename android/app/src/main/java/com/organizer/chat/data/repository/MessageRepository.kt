package com.organizer.chat.data.repository

import com.organizer.chat.data.api.ApiClient
import com.organizer.chat.data.model.Message
import com.organizer.chat.data.model.SendMessageRequest

class MessageRepository {
    private val api = ApiClient.getService()

    suspend fun getMessages(roomId: String, limit: Int = 50, before: String? = null): Result<List<Message>> {
        return try {
            val response = api.getMessages(roomId, limit, before)
            Result.success(response.messages)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun sendMessage(roomId: String, content: String, type: String = "text"): Result<Message> {
        return try {
            val request = SendMessageRequest(roomId = roomId, content = content, type = type)
            val response = api.sendMessage(request)
            Result.success(response.message)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun markAsRead(messageId: String): Result<Message> {
        return try {
            val response = api.markAsRead(messageId)
            Result.success(response.message)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
