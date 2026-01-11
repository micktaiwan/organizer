package com.organizer.chat.data.api

import com.organizer.chat.data.model.*
import com.organizer.chat.data.model.AppUpdateInfo
import com.organizer.chat.data.model.ApkVersionsResponse
import okhttp3.MultipartBody
import okhttp3.RequestBody
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

    @POST("rooms/{roomId}/leave")
    suspend fun leaveRoom(@Path("roomId") roomId: String): SuccessResponse

    @POST("rooms/{roomId}/read")
    suspend fun markRoomAsRead(@Path("roomId") roomId: String): SuccessResponse

    @POST("rooms")
    suspend fun createRoom(@Body request: CreateRoomRequest): RoomResponse

    // Messages
    @POST("messages")
    suspend fun sendMessage(@Body request: SendMessageRequest): MessageResponse

    @Multipart
    @POST("upload/image")
    suspend fun uploadImageMessage(
        @Part image: MultipartBody.Part,
        @Part("roomId") roomId: RequestBody,
        @Part("caption") caption: RequestBody?
    ): MessageResponse

    @PATCH("messages/{messageId}/read")
    suspend fun markAsRead(@Path("messageId") messageId: String): MessageResponse

    @POST("messages/{messageId}/react")
    suspend fun reactToMessage(
        @Path("messageId") messageId: String,
        @Body request: ReactRequest
    ): ReactResponse

    // Users
    @GET("users/search")
    suspend fun searchUsers(@Query("q") query: String): UsersSearchResponse

    @PUT("users/status")
    suspend fun updateStatus(@Body request: UpdateStatusRequest): StatusUpdateResponse

    // App Updates
    @GET("apk/latest")
    suspend fun getLatestApkVersion(): AppUpdateInfo

    @GET("apk/versions")
    suspend fun getApkVersions(@Query("limit") limit: Int? = null): ApkVersionsResponse

    // Notes
    @GET("notes")
    suspend fun getNotes(
        @Query("labelId") labelId: String? = null,
        @Query("archived") archived: Boolean = false
    ): NotesResponse

    @GET("notes/{noteId}")
    suspend fun getNote(@Path("noteId") noteId: String): NoteResponse

    @POST("notes")
    suspend fun createNote(@Body request: CreateNoteRequest): NoteResponse

    @PUT("notes/{noteId}")
    suspend fun updateNote(
        @Path("noteId") noteId: String,
        @Body request: UpdateNoteRequest
    ): NoteResponse

    @PATCH("notes/{noteId}")
    suspend fun patchNote(
        @Path("noteId") noteId: String,
        @Body request: UpdateNoteRequest
    ): NoteResponse

    @DELETE("notes/{noteId}")
    suspend fun deleteNote(@Path("noteId") noteId: String): SuccessResponse

    @POST("notes/reorder")
    suspend fun reorderNote(@Body request: ReorderNoteRequest): SuccessResponse

    @POST("notes/{noteId}/items")
    suspend fun addChecklistItem(
        @Path("noteId") noteId: String,
        @Body request: AddChecklistItemRequest
    ): NoteResponse

    @PATCH("notes/{noteId}/items/{itemId}")
    suspend fun patchChecklistItem(
        @Path("noteId") noteId: String,
        @Path("itemId") itemId: String,
        @Body request: PatchChecklistItemRequest
    ): NoteResponse

    @DELETE("notes/{noteId}/items/{itemId}")
    suspend fun deleteChecklistItem(
        @Path("noteId") noteId: String,
        @Path("itemId") itemId: String
    ): NoteResponse

    @POST("notes/{noteId}/items/reorder")
    suspend fun reorderChecklistItems(
        @Path("noteId") noteId: String,
        @Body request: ReorderItemsRequest
    ): NoteResponse

    // Labels
    @GET("labels")
    suspend fun getLabels(): LabelsResponse

    @GET("labels/{labelId}")
    suspend fun getLabel(@Path("labelId") labelId: String): LabelResponse

    @POST("labels")
    suspend fun createLabel(@Body request: CreateLabelRequest): LabelResponse

    @PUT("labels/{labelId}")
    suspend fun updateLabel(
        @Path("labelId") labelId: String,
        @Body request: UpdateLabelRequest
    ): LabelResponse

    @DELETE("labels/{labelId}")
    suspend fun deleteLabel(@Path("labelId") labelId: String): SuccessResponse

    // Location
    @PUT("users/location")
    suspend fun updateLocation(@Body request: UpdateLocationRequest): LocationUpdateResponse

    @GET("users/locations")
    suspend fun getUsersWithLocations(): UsersWithLocationResponse
}

data class UsersSearchResponse(
    val users: List<User>
)

data class UpdateStatusRequest(
    val status: String? = null,
    val statusMessage: String? = null,
    val expiresAt: String? = null,
    val isMuted: Boolean? = null
)

data class StatusUpdateResponse(
    val success: Boolean,
    val user: StatusUser? = null
)

data class StatusUser(
    val status: String,
    val statusMessage: String?,
    val statusExpiresAt: String?,
    val isMuted: Boolean
)
