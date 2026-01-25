package com.organizer.chat.util

import android.content.Context
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.MediaRecorder
import android.media.projection.MediaProjection
import android.os.Build
import android.util.DisplayMetrics
import android.util.Log
import android.view.WindowManager
import java.io.File

class ScreenRecorder(private val context: Context) {

    companion object {
        private const val TAG = "ScreenRecorder"
        private const val VIDEO_WIDTH = 1280
        private const val VIDEO_HEIGHT = 720
        private const val VIDEO_BITRATE = 1_000_000 // 1 Mbps
        private const val VIDEO_FRAME_RATE = 30
        private const val AUDIO_BITRATE = 128_000
        private const val AUDIO_SAMPLE_RATE = 44100
    }

    private var mediaRecorder: MediaRecorder? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var mediaProjection: MediaProjection? = null
    private var outputFile: File? = null
    var isRecording: Boolean = false
        private set

    fun startRecording(projection: MediaProjection): Boolean {
        if (isRecording) {
            Log.w(TAG, "Already recording")
            return false
        }

        try {
            mediaProjection = projection
            outputFile = File(context.cacheDir, "recording-${System.currentTimeMillis()}.mp4")

            // Get screen density
            val windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
            val metrics = DisplayMetrics()
            @Suppress("DEPRECATION")
            windowManager.defaultDisplay.getMetrics(metrics)
            val densityDpi = metrics.densityDpi

            // Configure MediaRecorder
            mediaRecorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                MediaRecorder(context)
            } else {
                @Suppress("DEPRECATION")
                MediaRecorder()
            }.apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setVideoSource(MediaRecorder.VideoSource.SURFACE)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setVideoEncoder(MediaRecorder.VideoEncoder.H264)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setVideoSize(VIDEO_WIDTH, VIDEO_HEIGHT)
                setVideoFrameRate(VIDEO_FRAME_RATE)
                setVideoEncodingBitRate(VIDEO_BITRATE)
                setAudioEncodingBitRate(AUDIO_BITRATE)
                setAudioSamplingRate(AUDIO_SAMPLE_RATE)
                setOutputFile(outputFile!!.absolutePath)
                prepare()
            }

            // Create virtual display
            virtualDisplay = projection.createVirtualDisplay(
                "ScreenRecorder",
                VIDEO_WIDTH,
                VIDEO_HEIGHT,
                densityDpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                mediaRecorder!!.surface,
                null,
                null
            )

            mediaRecorder!!.start()
            isRecording = true

            Log.d(TAG, "Recording started: ${outputFile?.absolutePath}")
            return true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start recording", e)
            cleanup()
            return false
        }
    }

    fun stopRecording(): File? {
        if (!isRecording) {
            Log.w(TAG, "Not recording")
            return null
        }

        try {
            mediaRecorder?.apply {
                stop()
                release()
            }
            mediaRecorder = null

            virtualDisplay?.release()
            virtualDisplay = null

            isRecording = false

            val file = outputFile
            if (file != null && file.exists() && file.length() > 0) {
                Log.d(TAG, "Recording stopped. File size: ${file.length()} bytes")
                return file
            } else {
                Log.e(TAG, "Output file is empty or doesn't exist")
                outputFile = null
                return null
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to stop recording", e)
            cleanup()
            return null
        }
    }

    fun cancelRecording() {
        Log.d(TAG, "Recording cancelled")
        cleanup()
    }

    private fun cleanup() {
        try {
            mediaRecorder?.apply {
                if (isRecording) {
                    stop()
                }
                release()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping MediaRecorder", e)
        }
        mediaRecorder = null

        try {
            virtualDisplay?.release()
        } catch (e: Exception) {
            Log.e(TAG, "Error releasing VirtualDisplay", e)
        }
        virtualDisplay = null

        isRecording = false

        // Delete any partial recording
        outputFile?.let {
            if (it.exists()) {
                it.delete()
            }
        }
        outputFile = null
    }

    fun deleteRecordingFile() {
        outputFile?.let {
            if (it.exists()) {
                it.delete()
                Log.d(TAG, "Deleted recording file: ${it.absolutePath}")
            }
        }
        outputFile = null
    }

    fun release() {
        cleanup()
        mediaProjection = null
    }
}
