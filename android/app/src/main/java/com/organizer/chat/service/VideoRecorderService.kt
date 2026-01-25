package com.organizer.chat.service

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.organizer.chat.MainActivity
import com.organizer.chat.R

class VideoRecorderService : Service() {

    companion object {
        private const val TAG = "VideoRecorderService"
        private const val NOTIFICATION_ID = 5
        const val CHANNEL_RECORDING = "recording"

        const val ACTION_START = "com.organizer.chat.action.START_RECORDING"
        const val ACTION_STOP = "com.organizer.chat.action.STOP_RECORDING"

        const val EXTRA_RESULT_CODE = "result_code"
        const val EXTRA_RESULT_DATA = "result_data"

        private var mediaProjection: MediaProjection? = null
        private var onProjectionReady: ((MediaProjection) -> Unit)? = null
        private var onProjectionStopped: (() -> Unit)? = null

        fun setCallbacks(
            onReady: ((MediaProjection) -> Unit)?,
            onStopped: (() -> Unit)?
        ) {
            onProjectionReady = onReady
            onProjectionStopped = onStopped
        }

        fun start(context: Context, resultCode: Int, resultData: Intent) {
            val intent = Intent(context, VideoRecorderService::class.java).apply {
                action = ACTION_START
                putExtra(EXTRA_RESULT_CODE, resultCode)
                putExtra(EXTRA_RESULT_DATA, resultData)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            val intent = Intent(context, VideoRecorderService::class.java).apply {
                action = ACTION_STOP
            }
            context.startService(intent)
        }
    }

    private val projectionCallback = object : MediaProjection.Callback() {
        override fun onStop() {
            Log.d(TAG, "MediaProjection stopped")
            onProjectionStopped?.invoke()
        }
    }

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "VideoRecorderService onCreate")
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0)
                val resultData = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    intent.getParcelableExtra(EXTRA_RESULT_DATA, Intent::class.java)
                } else {
                    @Suppress("DEPRECATION")
                    intent.getParcelableExtra(EXTRA_RESULT_DATA)
                }

                if (resultData != null) {
                    startForegroundWithNotification()
                    createMediaProjection(resultCode, resultData)
                } else {
                    Log.e(TAG, "Missing result data")
                    stopSelf()
                }
            }
            ACTION_STOP -> {
                stopRecording()
            }
        }
        return START_NOT_STICKY
    }

    private fun startForegroundWithNotification() {
        val notification = createNotification()
        startForeground(NOTIFICATION_ID, notification)
    }

    private fun createNotification(): Notification {
        val contentIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val contentPendingIntent = PendingIntent.getActivity(
            this,
            0,
            contentIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val stopIntent = Intent(this, VideoRecorderService::class.java).apply {
            action = ACTION_STOP
        }
        val stopPendingIntent = PendingIntent.getService(
            this,
            1,
            stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_RECORDING)
            .setContentTitle("Enregistrement en cours")
            .setContentText("Tap pour revenir à l'app")
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setContentIntent(contentPendingIntent)
            .addAction(R.drawable.ic_launcher_foreground, "Arrêter", stopPendingIntent)
            .build()
    }

    private fun createMediaProjection(resultCode: Int, resultData: Intent) {
        try {
            val projectionManager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
            mediaProjection = projectionManager.getMediaProjection(resultCode, resultData)
            mediaProjection?.registerCallback(projectionCallback, null)

            Log.d(TAG, "MediaProjection created")
            mediaProjection?.let { projection ->
                onProjectionReady?.invoke(projection)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to create MediaProjection", e)
            stopSelf()
        }
    }

    private fun stopRecording() {
        Log.d(TAG, "Stopping recording")
        mediaProjection?.stop()
        mediaProjection = null
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "VideoRecorderService onDestroy")
        mediaProjection?.stop()
        mediaProjection = null
    }
}
