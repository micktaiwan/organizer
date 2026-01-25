package com.organizer.chat.ui.screens.camera

import android.util.Log
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Cameraswitch
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.FiberManualRecord
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.organizer.chat.util.CameraRecorder
import kotlinx.coroutines.delay
import java.io.File

private const val TAG = "CameraRecordScreen"

/**
 * Full-screen camera recording screen.
 * Shows camera preview with record/stop, switch camera, and close controls.
 */
@Composable
fun CameraRecordScreen(
    onRecordingComplete: (File) -> Unit,
    onDismiss: () -> Unit,
    onError: (String) -> Unit
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    var isRecording by remember { mutableStateOf(false) }
    var recordingDuration by remember { mutableIntStateOf(0) }
    var previewView by remember { mutableStateOf<PreviewView?>(null) }

    val cameraRecorder = remember { CameraRecorder(context) }

    // Timer for recording duration
    LaunchedEffect(isRecording) {
        if (isRecording) {
            recordingDuration = 0
            while (isRecording) {
                delay(1000)
                recordingDuration++
            }
        }
    }

    // Clean up on dispose
    DisposableEffect(Unit) {
        onDispose {
            Log.d(TAG, "Disposing CameraRecordScreen")
            if (cameraRecorder.isRecording()) {
                cameraRecorder.stopRecording()
            }
            cameraRecorder.release()
        }
    }

    Dialog(
        onDismissRequest = {
            if (!isRecording) {
                onDismiss()
            }
        },
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            decorFitsSystemWindows = false
        )
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black)
        ) {
            // Camera Preview
            AndroidView(
                factory = { ctx ->
                    PreviewView(ctx).also { view ->
                        previewView = view
                        view.implementationMode = PreviewView.ImplementationMode.COMPATIBLE
                        cameraRecorder.bind(
                            lifecycleOwner = lifecycleOwner,
                            previewView = view,
                            onBound = {
                                Log.d(TAG, "Camera bound successfully")
                            },
                            onError = { e ->
                                Log.e(TAG, "Camera bind error: ${e.message}")
                                onError("Impossible d'accéder à la caméra")
                            }
                        )
                    }
                },
                modifier = Modifier.fillMaxSize()
            )

            // Close button (top left) - only when not recording
            if (!isRecording) {
                IconButton(
                    onClick = onDismiss,
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(16.dp)
                        .background(
                            color = Color.Black.copy(alpha = 0.5f),
                            shape = CircleShape
                        )
                ) {
                    Icon(
                        imageVector = Icons.Default.Close,
                        contentDescription = "Fermer",
                        tint = Color.White
                    )
                }
            }

            // Switch camera button (top right) - only when not recording
            if (!isRecording) {
                IconButton(
                    onClick = {
                        previewView?.let { view ->
                            cameraRecorder.switchCamera(lifecycleOwner, view)
                        }
                    },
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(16.dp)
                        .background(
                            color = Color.Black.copy(alpha = 0.5f),
                            shape = CircleShape
                        )
                ) {
                    Icon(
                        imageVector = Icons.Default.Cameraswitch,
                        contentDescription = "Changer de caméra",
                        tint = Color.White
                    )
                }
            }

            // Recording duration (top center) - only when recording
            if (isRecording) {
                Box(
                    modifier = Modifier
                        .align(Alignment.TopCenter)
                        .padding(16.dp)
                        .background(
                            color = Color.Red.copy(alpha = 0.8f),
                            shape = CircleShape
                        )
                        .padding(horizontal = 16.dp, vertical = 8.dp)
                ) {
                    Text(
                        text = formatDuration(recordingDuration),
                        color = Color.White,
                        style = MaterialTheme.typography.titleMedium
                    )
                }
            }

            // Record/Stop button (bottom center)
            IconButton(
                onClick = {
                    if (isRecording) {
                        // Stop recording
                        isRecording = false
                        cameraRecorder.stopRecording()
                    } else {
                        // Start recording
                        isRecording = true
                        cameraRecorder.startRecording(
                            onComplete = { file ->
                                Log.d(TAG, "Recording complete: ${file.absolutePath}")
                                onRecordingComplete(file)
                            },
                            onError = { error ->
                                Log.e(TAG, "Recording error: $error")
                                isRecording = false
                                onError(error)
                            }
                        )
                    }
                },
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 48.dp)
                    .size(80.dp)
                    .background(
                        color = if (isRecording) Color.Red else Color.White,
                        shape = CircleShape
                    )
            ) {
                Icon(
                    imageVector = if (isRecording) Icons.Default.Stop else Icons.Default.FiberManualRecord,
                    contentDescription = if (isRecording) "Arrêter" else "Enregistrer",
                    tint = if (isRecording) Color.White else Color.Red,
                    modifier = Modifier.size(48.dp)
                )
            }
        }
    }
}

private fun formatDuration(seconds: Int): String {
    val mins = seconds / 60
    val secs = seconds % 60
    return "%d:%02d".format(mins, secs)
}
