package com.organizer.chat.data.model

import com.google.gson.annotations.SerializedName

data class GalleryFile(
    val id: String,
    val type: String,  // "image" or "file"
    val url: String,
    val fileName: String?,
    val fileSize: Long?,
    val mimeType: String?,
    val caption: String?,
    val roomId: String,
    val roomName: String,
    val senderId: String,
    val senderName: String,
    val createdAt: String
)

data class GalleryFilesResponse(
    val files: List<GalleryFile>
)
