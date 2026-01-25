package com.organizer.chat.data.model

import com.google.gson.annotations.SerializedName

data class GalleryFile(
    val id: String,
    val type: String,  // "image", "file", or "video"
    val url: String,
    val fileName: String?,
    val fileSize: Long?,
    val mimeType: String?,
    val caption: String?,
    val roomId: String,
    val roomName: String,
    val senderId: String,
    val senderName: String,
    val createdAt: String,
    // Video-specific fields
    val thumbnailUrl: String? = null,
    val duration: Double? = null,
    val width: Int? = null,
    val height: Int? = null
)

data class GalleryFilesResponse(
    val files: List<GalleryFile>
)
