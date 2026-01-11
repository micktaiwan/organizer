package com.organizer.chat.util

import android.app.DownloadManager
import android.content.ContentValues
import android.content.Context
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.util.Log
import com.organizer.chat.data.api.ApiClient
import java.io.File
import java.io.FileOutputStream

object ImageDownloader {
    private const val TAG = "ImageDownloader"

    sealed class DownloadResult {
        data class Success(val fileName: String) : DownloadResult()
        data class Error(val message: String) : DownloadResult()
    }

    fun downloadImage(context: Context, imageUrl: String): DownloadResult {
        return if (imageUrl.startsWith("data:")) {
            saveBase64Image(context, imageUrl)
        } else {
            downloadHttpImage(context, imageUrl)
        }
    }

    fun needsStoragePermission(): Boolean {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
    }

    private fun saveBase64Image(context: Context, dataUrl: String): DownloadResult {
        return try {
            // Extract MIME type and data
            val mimeType = dataUrl.substringAfter("data:").substringBefore(";")
            val extension = when {
                mimeType.contains("png") -> "png"
                mimeType.contains("gif") -> "gif"
                mimeType.contains("webp") -> "webp"
                else -> "jpg"
            }
            val base64Data = dataUrl.substringAfter(",")
            val imageBytes = Base64.decode(base64Data, Base64.DEFAULT)

            val fileName = "organizer_${System.currentTimeMillis()}.$extension"

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                // Android 10+: Use MediaStore
                val contentValues = ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, fileName)
                    put(MediaStore.Downloads.MIME_TYPE, mimeType)
                    put(MediaStore.Downloads.IS_PENDING, 1)
                }

                val uri = context.contentResolver.insert(
                    MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                    contentValues
                )

                uri?.let {
                    context.contentResolver.openOutputStream(it)?.use { output ->
                        output.write(imageBytes)
                    }
                    contentValues.clear()
                    contentValues.put(MediaStore.Downloads.IS_PENDING, 0)
                    context.contentResolver.update(uri, contentValues, null, null)
                    Log.d(TAG, "Base64 image saved via MediaStore: $fileName")
                    DownloadResult.Success(fileName)
                } ?: DownloadResult.Error("Impossible de creer le fichier")
            } else {
                // Android 9-: Direct file write
                @Suppress("DEPRECATION")
                val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                val file = File(downloadsDir, fileName)
                FileOutputStream(file).use { it.write(imageBytes) }

                // Notify media scanner
                MediaScannerConnection.scanFile(context, arrayOf(file.absolutePath), null, null)
                Log.d(TAG, "Base64 image saved to Downloads: $fileName")
                DownloadResult.Success(fileName)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save base64 image", e)
            DownloadResult.Error(e.message ?: "Erreur lors de l'enregistrement")
        }
    }

    private fun downloadHttpImage(context: Context, imageUrl: String): DownloadResult {
        return try {
            // Build full URL if relative
            val fullUrl = if (imageUrl.startsWith("/")) {
                ApiClient.getBaseUrl().trimEnd('/') + imageUrl
            } else {
                imageUrl
            }

            // Detect extension from URL
            val extension = imageUrl.substringAfterLast(".").take(4).lowercase().let {
                if (it in listOf("jpg", "jpeg", "png", "gif", "webp")) it else "jpg"
            }
            val fileName = "organizer_${System.currentTimeMillis()}.$extension"

            // Detect mime type
            val mimeType = when (extension) {
                "png" -> "image/png"
                "gif" -> "image/gif"
                "webp" -> "image/webp"
                else -> "image/jpeg"
            }

            val request = DownloadManager.Request(Uri.parse(fullUrl)).apply {
                setTitle("Image Organizer")
                setDescription("Telechargement en cours...")
                setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName)
                setMimeType(mimeType)
            }

            val downloadManager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            downloadManager.enqueue(request)

            Log.d(TAG, "HTTP image download started: $fileName from $fullUrl")
            DownloadResult.Success(fileName)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to download HTTP image", e)
            DownloadResult.Error(e.message ?: "Erreur lors du telechargement")
        }
    }
}
