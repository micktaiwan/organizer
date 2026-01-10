package com.organizer.chat.util

import android.content.Context
import android.media.MediaRecorder
import android.os.Build
import android.util.Base64
import android.util.Log
import java.io.File

class VoiceRecorder(private val context: Context) {

    companion object {
        private const val TAG = "VoiceRecorder"
    }

    private var mediaRecorder: MediaRecorder? = null
    private var audioFile: File? = null
    var isRecording: Boolean = false
        private set

    fun startRecording(): Boolean {
        if (isRecording) {
            Log.w(TAG, "Already recording")
            return false
        }

        try {
            audioFile = File(context.cacheDir, "voice_${System.currentTimeMillis()}.m4a")

            mediaRecorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                MediaRecorder(context)
            } else {
                @Suppress("DEPRECATION")
                MediaRecorder()
            }.apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setAudioEncodingBitRate(128000)
                setAudioSamplingRate(44100)
                setOutputFile(audioFile!!.absolutePath)
                prepare()
                start()
            }

            isRecording = true
            Log.d(TAG, "Recording started: ${audioFile?.absolutePath}")
            return true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start recording", e)
            cleanup()
            return false
        }
    }

    fun stopRecording(): String? {
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
            isRecording = false

            val file = audioFile
            if (file != null && file.exists()) {
                val bytes = file.readBytes()
                val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                val dataUrl = "data:audio/mp4;base64,$base64"

                Log.d(TAG, "Recording stopped. File size: ${bytes.size} bytes")

                // Clean up the file
                file.delete()
                audioFile = null

                return dataUrl
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to stop recording", e)
        }

        cleanup()
        return null
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
            Log.e(TAG, "Error during cleanup", e)
        }
        mediaRecorder = null
        isRecording = false

        audioFile?.let {
            if (it.exists()) {
                it.delete()
            }
        }
        audioFile = null
    }

    fun release() {
        cleanup()
    }
}
