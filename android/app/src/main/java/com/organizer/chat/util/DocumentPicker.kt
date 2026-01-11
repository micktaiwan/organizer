package com.organizer.chat.util

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import java.io.File
import java.io.FileOutputStream

data class DocumentInfo(
    val uri: Uri,
    val fileName: String,
    val fileSize: Long,
    val mimeType: String
)

object DocumentPicker {

    fun getDocumentInfo(context: Context, uri: Uri): DocumentInfo {
        var fileName = "unknown"
        var fileSize = 0L
        val mimeType = context.contentResolver.getType(uri) ?: "application/octet-stream"

        context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
                val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
                if (nameIndex >= 0) fileName = cursor.getString(nameIndex)
                if (sizeIndex >= 0) fileSize = cursor.getLong(sizeIndex)
            }
        }

        return DocumentInfo(uri, fileName, fileSize, mimeType)
    }

    fun copyToTempFile(context: Context, documentInfo: DocumentInfo): File? {
        return try {
            val tempFile = File(context.cacheDir, "upload_${System.currentTimeMillis()}_${documentInfo.fileName}")
            context.contentResolver.openInputStream(documentInfo.uri)?.use { input ->
                FileOutputStream(tempFile).use { output ->
                    input.copyTo(output)
                }
            }
            tempFile
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    fun formatFileSize(bytes: Long): String {
        return when {
            bytes < 1024 -> "$bytes B"
            bytes < 1024 * 1024 -> "${bytes / 1024} KB"
            else -> String.format("%.1f MB", bytes / (1024.0 * 1024.0))
        }
    }
}
