package com.organizer.chat.util

import android.content.Context
import android.net.Uri
import androidx.activity.compose.ManagedActivityResultLauncher
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.FileProvider
import java.io.File

data class ImagePickerLaunchers(
    val cameraLauncher: ManagedActivityResultLauncher<Uri, Boolean>,
    val galleryLauncher: ManagedActivityResultLauncher<PickVisualMediaRequest, Uri?>,
    val createCameraUri: () -> Uri
)

@Composable
fun rememberImagePickerLaunchers(
    onImageCaptured: (Uri) -> Unit,
    onImageSelected: (Uri) -> Unit
): ImagePickerLaunchers {
    val context = LocalContext.current

    // Camera launcher
    val cameraLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.TakePicture()
    ) { success ->
        if (success) {
            // URI is saved in the temp file we created
            val tempFile = File(context.cacheDir, "images/temp_photo.jpg")
            if (tempFile.exists()) {
                val uri = FileProvider.getUriForFile(
                    context,
                    "${context.packageName}.fileprovider",
                    tempFile
                )
                onImageCaptured(uri)
            }
        }
    }

    // Gallery launcher (Android 13+ Photo Picker)
    val galleryLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia()
    ) { uri ->
        uri?.let { onImageSelected(it) }
    }

    // Function to create camera URI
    val createCameraUri: () -> Uri = remember {
        {
            val tempDir = File(context.cacheDir, "images")
            if (!tempDir.exists()) {
                tempDir.mkdirs()
            }
            val tempFile = File(tempDir, "temp_photo.jpg")
            FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                tempFile
            )
        }
    }

    return ImagePickerLaunchers(cameraLauncher, galleryLauncher, createCameraUri)
}
