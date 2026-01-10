package com.organizer.chat.util

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream

class ImageCompressor(private val context: Context) {

    companion object {
        private const val MAX_DIMENSION = 1920
        private const val TARGET_SIZE_BYTES = 2 * 1024 * 1024 // 2MB
        private const val INITIAL_QUALITY = 80
    }

    suspend fun compressImage(sourceUri: Uri): File? = withContext(Dispatchers.IO) {
        try {
            // Read the image
            val inputStream = context.contentResolver.openInputStream(sourceUri) ?: return@withContext null
            val originalBitmap = BitmapFactory.decodeStream(inputStream)
            inputStream.close()

            if (originalBitmap == null) return@withContext null

            // Get image orientation from EXIF
            val exifInputStream = context.contentResolver.openInputStream(sourceUri)
            val exif = exifInputStream?.let { ExifInterface(it) }
            exifInputStream?.close()

            val orientation = exif?.getAttributeInt(
                ExifInterface.TAG_ORIENTATION,
                ExifInterface.ORIENTATION_NORMAL
            ) ?: ExifInterface.ORIENTATION_NORMAL

            // Rotate if needed
            val rotatedBitmap = rotateBitmap(originalBitmap, orientation)
            if (rotatedBitmap != originalBitmap) {
                originalBitmap.recycle()
            }

            // Resize if too large
            val resizedBitmap = resizeBitmap(rotatedBitmap, MAX_DIMENSION)
            if (resizedBitmap != rotatedBitmap) {
                rotatedBitmap.recycle()
            }

            // Compress to target size
            val compressedFile = compressToTargetSize(resizedBitmap)
            resizedBitmap.recycle()

            compressedFile
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    private fun rotateBitmap(bitmap: Bitmap, orientation: Int): Bitmap {
        val matrix = Matrix()
        when (orientation) {
            ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
            ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
            ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
            ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.postScale(-1f, 1f)
            ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.postScale(1f, -1f)
            else -> return bitmap
        }

        return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
    }

    private fun resizeBitmap(bitmap: Bitmap, maxDimension: Int): Bitmap {
        val width = bitmap.width
        val height = bitmap.height

        if (width <= maxDimension && height <= maxDimension) {
            return bitmap
        }

        val scale = if (width > height) {
            maxDimension.toFloat() / width
        } else {
            maxDimension.toFloat() / height
        }

        val newWidth = (width * scale).toInt()
        val newHeight = (height * scale).toInt()

        return Bitmap.createScaledBitmap(bitmap, newWidth, newHeight, true)
    }

    private fun compressToTargetSize(bitmap: Bitmap): File {
        val tempFile = File(context.cacheDir, "compressed_${System.currentTimeMillis()}.jpg")
        var quality = INITIAL_QUALITY

        do {
            FileOutputStream(tempFile).use { out ->
                bitmap.compress(Bitmap.CompressFormat.JPEG, quality, out)
            }

            if (tempFile.length() <= TARGET_SIZE_BYTES || quality <= 60) {
                break
            }

            quality -= 10
        } while (quality > 0)

        return tempFile
    }

    fun cleanup(file: File?) {
        try {
            file?.delete()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}
