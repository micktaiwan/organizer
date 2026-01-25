package com.organizer.chat.util

import android.annotation.SuppressLint
import android.content.Context
import android.util.Log
import androidx.camera.core.CameraSelector
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.FileOutputOptions
import androidx.camera.video.Quality
import androidx.camera.video.QualitySelector
import androidx.camera.video.Recorder
import androidx.camera.video.Recording
import androidx.camera.video.VideoCapture
import androidx.camera.video.VideoRecordEvent
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import java.io.File
import java.util.concurrent.Executor

/**
 * Utility class for recording video using CameraX.
 * Supports front/back camera switching and recording to file.
 */
class CameraRecorder(private val context: Context) {

    companion object {
        private const val TAG = "CameraRecorder"
    }

    private var cameraProvider: ProcessCameraProvider? = null
    private var videoCapture: VideoCapture<Recorder>? = null
    private var recording: Recording? = null
    private var cameraSelector = CameraSelector.DEFAULT_FRONT_CAMERA
    private var isFrontCamera = true
    private val mainExecutor: Executor = ContextCompat.getMainExecutor(context)

    /**
     * Initialize and bind camera to the preview view.
     * Must be called from the main thread.
     */
    fun bind(
        lifecycleOwner: LifecycleOwner,
        previewView: PreviewView,
        onBound: () -> Unit = {},
        onError: (Exception) -> Unit = {}
    ) {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(context)

        cameraProviderFuture.addListener({
            try {
                cameraProvider = cameraProviderFuture.get()
                bindCameraUseCases(lifecycleOwner, previewView)
                onBound()
            } catch (e: Exception) {
                Log.e(TAG, "Failed to bind camera: ${e.message}")
                onError(e)
            }
        }, mainExecutor)
    }

    private fun bindCameraUseCases(lifecycleOwner: LifecycleOwner, previewView: PreviewView) {
        val provider = cameraProvider ?: return

        // Unbind previous use cases
        provider.unbindAll()

        // Preview use case
        val preview = Preview.Builder()
            .build()
            .apply {
                setSurfaceProvider(previewView.surfaceProvider)
            }

        // Video capture use case with HD quality
        val recorder = Recorder.Builder()
            .setQualitySelector(
                QualitySelector.from(
                    Quality.HD,
                    androidx.camera.video.FallbackStrategy.higherQualityOrLowerThan(Quality.SD)
                )
            )
            .build()

        videoCapture = VideoCapture.withOutput(recorder)

        try {
            provider.bindToLifecycle(
                lifecycleOwner,
                cameraSelector,
                preview,
                videoCapture
            )
            Log.d(TAG, "Camera bound successfully with ${if (isFrontCamera) "front" else "back"} camera")
        } catch (e: Exception) {
            Log.e(TAG, "Use case binding failed: ${e.message}")
        }
    }

    /**
     * Start recording video to a file.
     * @param onComplete Called when recording is complete with the output file.
     * @param onError Called if recording fails.
     */
    @SuppressLint("MissingPermission")
    fun startRecording(
        onComplete: (File) -> Unit,
        onError: (String) -> Unit
    ) {
        val capture = videoCapture ?: run {
            onError("Video capture not initialized")
            return
        }

        if (recording != null) {
            Log.w(TAG, "Recording already in progress")
            return
        }

        // Create output file
        val outputFile = File(
            context.cacheDir,
            "camera-${System.currentTimeMillis()}.mp4"
        )

        val outputOptions = FileOutputOptions.Builder(outputFile).build()

        recording = capture.output
            .prepareRecording(context, outputOptions)
            .withAudioEnabled()
            .start(mainExecutor) { event ->
                when (event) {
                    is VideoRecordEvent.Start -> {
                        Log.d(TAG, "Recording started: ${outputFile.absolutePath}")
                    }
                    is VideoRecordEvent.Finalize -> {
                        recording = null
                        if (event.hasError()) {
                            Log.e(TAG, "Recording error: ${event.error}")
                            outputFile.delete()
                            onError("Recording failed: error code ${event.error}")
                        } else {
                            Log.d(TAG, "Recording finished: ${outputFile.absolutePath}, size: ${outputFile.length()}")
                            onComplete(outputFile)
                        }
                    }
                }
            }

        Log.d(TAG, "Recording started")
    }

    /**
     * Stop the current recording.
     */
    fun stopRecording() {
        recording?.stop()
        recording = null
        Log.d(TAG, "Recording stopped")
    }

    /**
     * Switch between front and back camera.
     * Must rebind after switching.
     */
    fun switchCamera(lifecycleOwner: LifecycleOwner, previewView: PreviewView) {
        isFrontCamera = !isFrontCamera
        cameraSelector = if (isFrontCamera) {
            CameraSelector.DEFAULT_FRONT_CAMERA
        } else {
            CameraSelector.DEFAULT_BACK_CAMERA
        }
        Log.d(TAG, "Switching to ${if (isFrontCamera) "front" else "back"} camera")
        bindCameraUseCases(lifecycleOwner, previewView)
    }

    /**
     * Check if currently using front camera.
     */
    fun isFrontCamera(): Boolean = isFrontCamera

    /**
     * Check if recording is in progress.
     */
    fun isRecording(): Boolean = recording != null

    /**
     * Release all camera resources.
     */
    fun release() {
        recording?.stop()
        recording = null
        cameraProvider?.unbindAll()
        cameraProvider = null
        videoCapture = null
        Log.d(TAG, "Camera resources released")
    }
}
