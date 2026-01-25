package com.organizer.chat.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.organizer.chat.data.model.GalleryFile

@Entity(tableName = "gallery_files")
data class GalleryFileEntity(
    @PrimaryKey
    val id: String,
    val type: String,
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
    val cachedAt: Long = System.currentTimeMillis(),
    // Video-specific fields
    val thumbnailUrl: String? = null,
    val duration: Double? = null,
    val width: Int? = null,
    val height: Int? = null
) {
    fun toGalleryFile(): GalleryFile = GalleryFile(
        id = id,
        type = type,
        url = url,
        fileName = fileName,
        fileSize = fileSize,
        mimeType = mimeType,
        caption = caption,
        roomId = roomId,
        roomName = roomName,
        senderId = senderId,
        senderName = senderName,
        createdAt = createdAt,
        thumbnailUrl = thumbnailUrl,
        duration = duration,
        width = width,
        height = height
    )

    companion object {
        fun fromGalleryFile(file: GalleryFile): GalleryFileEntity = GalleryFileEntity(
            id = file.id,
            type = file.type,
            url = file.url,
            fileName = file.fileName,
            fileSize = file.fileSize,
            mimeType = file.mimeType,
            caption = file.caption,
            roomId = file.roomId,
            roomName = file.roomName,
            senderId = file.senderId,
            senderName = file.senderName,
            createdAt = file.createdAt,
            thumbnailUrl = file.thumbnailUrl,
            duration = file.duration,
            width = file.width,
            height = file.height
        )
    }
}
