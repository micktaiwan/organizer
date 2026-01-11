package com.organizer.chat.data.repository

import com.organizer.chat.data.api.ApiClient
import com.organizer.chat.data.model.Message
import com.organizer.chat.data.model.ReactRequest
import com.organizer.chat.data.model.ReactResponse
import com.organizer.chat.data.model.SendMessageRequest
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File

class MessageRepository {
    private val api = ApiClient.getService()

    suspend fun getMessages(roomId: String, limit: Int = 20, before: String? = null): Result<List<Message>> {
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

    suspend fun reactToMessage(messageId: String, emoji: String): Result<ReactResponse> {
        return try {
            val request = ReactRequest(emoji = emoji)
            val response = api.reactToMessage(messageId, request)
            Result.success(response)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun uploadAndSendImage(roomId: String, imageFile: File, caption: String? = null): Result<Message> {
        return try {
            val requestBody = imageFile.asRequestBody("image/jpeg".toMediaTypeOrNull())
            val imagePart = MultipartBody.Part.createFormData("image", imageFile.name, requestBody)
            val roomIdPart = roomId.toRequestBody("text/plain".toMediaTypeOrNull())
            val captionPart = caption?.toRequestBody("text/plain".toMediaTypeOrNull())

            val response = api.uploadImageMessage(imagePart, roomIdPart, captionPart)
            Result.success(response.message)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun uploadAndSendFile(roomId: String, file: File, mimeType: String, caption: String? = null): Result<Message> {
        return try {
            val requestBody = file.asRequestBody(mimeType.toMediaTypeOrNull())
            val filePart = MultipartBody.Part.createFormData("file", file.name, requestBody)
            val roomIdPart = roomId.toRequestBody("text/plain".toMediaTypeOrNull())
            val captionPart = caption?.toRequestBody("text/plain".toMediaTypeOrNull())

            val response = api.uploadFileMessage(filePart, roomIdPart, captionPart)
            Result.success(response.message)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun deleteMessage(messageId: String): Result<Boolean> {
        return try {
            api.deleteMessage(messageId)
            Result.success(true)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
