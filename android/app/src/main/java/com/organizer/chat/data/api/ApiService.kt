package com.organizer.chat.data.api

import com.organizer.chat.data.model.*
import com.organizer.chat.data.model.AppUpdateInfo
import retrofit2.http.*

interface ApiService {

    // Auth
    @POST("auth/login")
    suspend fun login(@Body request: LoginRequest): LoginResponse

    @POST("auth/register")
    suspend fun register(@Body request: RegisterRequest): LoginResponse

    @GET("auth/me")
    suspend fun getCurrentUser(): UserResponse

    // Rooms
    @GET("rooms")
    suspend fun getRooms(): RoomsResponse

    @GET("rooms/{roomId}")
    suspend fun getRoom(@Path("roomId") roomId: String): RoomResponse

    @GET("rooms/{roomId}/messages")
    suspend fun getMessages(
        @Path("roomId") roomId: String,
        @Query("limit") limit: Int = 50,
        @Query("before") before: String? = null
    ): MessagesResponse

    @POST("rooms/{roomId}/join")
    suspend fun joinRoom(@Path("roomId") roomId: String): RoomResponse

    // Messages
    @POST("messages")
    suspend fun sendMessage(@Body request: SendMessageRequest): MessageResponse

    @PATCH("messages/{messageId}/read")
    suspend fun markAsRead(@Path("messageId") messageId: String): MessageResponse

    // Users
    @GET("users/search")
    suspend fun searchUsers(@Query("q") query: String): UsersSearchResponse

    @PUT("users/status")
    suspend fun updateStatus(@Body request: UpdateStatusRequest): StatusUpdateResponse

    // App Updates
    @GET("apk/latest")
    suspend fun getLatestApkVersion(): AppUpdateInfo
}

data class UsersSearchResponse(
    val users: List<User>
)

data class UpdateStatusRequest(
    val status: String? = null,
    val statusMessage: String? = null,
    val isMuted: Boolean? = null
)

data class StatusUpdateResponse(
    val success: Boolean,
    val user: StatusUser? = null
)

data class StatusUser(
    val status: String,
    val statusMessage: String?,
    val isMuted: Boolean
)
