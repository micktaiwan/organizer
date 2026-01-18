package com.organizer.chat.util

import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Environment
import android.util.Log
import android.widget.Toast
import androidx.core.content.FileProvider
import com.organizer.chat.data.api.ApiClient
import java.io.File

object FileOpener {
    private const val TAG = "FileOpener"

    sealed class OpenResult {
        data class Success(val fileName: String) : OpenResult()
        data class Downloading(val fileName: String) : OpenResult()
        data class Error(val message: String) : OpenResult()
    }

    /**
     * Download a file from URL and open it with the system app
     */
    fun downloadAndOpenFile(
        context: Context,
        fileUrl: String,
        fileName: String,
        mimeType: String?
    ): OpenResult {
        return try {
            // Build full URL if relative
            val fullUrl = if (fileUrl.startsWith("/")) {
                ApiClient.getBaseUrl().trimEnd('/') + fileUrl
            } else {
                fileUrl
            }

            // Check if file already exists in Downloads
            val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            val existingFile = File(downloadsDir, fileName)

            if (existingFile.exists()) {
                // File already downloaded, open it
                openFile(context, existingFile, mimeType)
                return OpenResult.Success(fileName)
            }

            // Download file
            val request = DownloadManager.Request(Uri.parse(fullUrl)).apply {
                setTitle(fileName)
                setDescription("Telechargement en cours...")
                setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName)
                if (mimeType != null) {
                    setMimeType(mimeType)
                }
            }

            val downloadManager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            downloadManager.enqueue(request)

            Log.d(TAG, "File download started: $fileName from $fullUrl")
            Toast.makeText(context, "Telechargement: $fileName", Toast.LENGTH_SHORT).show()

            OpenResult.Downloading(fileName)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to download file", e)
            OpenResult.Error(e.message ?: "Erreur de telechargement")
        }
    }

    /**
     * Open a file with the system app
     */
    fun openFile(context: Context, file: File, mimeType: String?) {
        try {
            val uri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                file
            )

            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, mimeType ?: getMimeTypeFromExtension(file.extension))
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }

            if (intent.resolveActivity(context.packageManager) != null) {
                context.startActivity(intent)
            } else {
                Toast.makeText(context, "Aucune application pour ouvrir ce fichier", Toast.LENGTH_SHORT).show()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to open file", e)
            Toast.makeText(context, "Impossible d'ouvrir le fichier", Toast.LENGTH_SHORT).show()
        }
    }

    /**
     * Get MIME type from file extension
     */
    private fun getMimeTypeFromExtension(extension: String): String {
        return when (extension.lowercase()) {
            "pdf" -> "application/pdf"
            "doc" -> "application/msword"
            "docx" -> "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            "xls" -> "application/vnd.ms-excel"
            "xlsx" -> "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            "ppt" -> "application/vnd.ms-powerpoint"
            "pptx" -> "application/vnd.openxmlformats-officedocument.presentationml.presentation"
            "txt" -> "text/plain"
            "html", "htm" -> "text/html"
            "json" -> "application/json"
            "xml" -> "application/xml"
            "zip" -> "application/zip"
            "rar" -> "application/x-rar-compressed"
            "7z" -> "application/x-7z-compressed"
            "mp3" -> "audio/mpeg"
            "wav" -> "audio/wav"
            "mp4" -> "video/mp4"
            "avi" -> "video/x-msvideo"
            "mkv" -> "video/x-matroska"
            "jpg", "jpeg" -> "image/jpeg"
            "png" -> "image/png"
            "gif" -> "image/gif"
            "webp" -> "image/webp"
            else -> "*/*"
        }
    }

    /**
     * Get icon for file type
     */
    fun getFileTypeIcon(mimeType: String?): String {
        return when {
            mimeType == null -> "📄"
            mimeType.startsWith("image/") -> "🖼️"
            mimeType.startsWith("video/") -> "🎬"
            mimeType.startsWith("audio/") -> "🎵"
            mimeType.contains("pdf") -> "📕"
            mimeType.contains("word") || mimeType.contains("document") -> "📝"
            mimeType.contains("excel") || mimeType.contains("spreadsheet") -> "📊"
            mimeType.contains("powerpoint") || mimeType.contains("presentation") -> "📽️"
            mimeType.contains("zip") || mimeType.contains("rar") || mimeType.contains("7z") -> "📦"
            mimeType.startsWith("text/") -> "📄"
            else -> "📄"
        }
    }
}
