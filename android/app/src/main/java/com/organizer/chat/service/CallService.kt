package com.organizer.chat.service

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import com.organizer.chat.MainActivity
import com.organizer.chat.R
import com.organizer.chat.webrtc.CallState

// Callback interface for call actions from notifications
interface CallActionCallback {
    fun onAcceptCall(callerId: String, withCamera: Boolean)
    fun onRejectCall(callerId: String)
    fun onEndCall()
}

class CallService : Service() {

    companion object {
        private const val TAG = "CallService"
        private const val NOTIFICATION_ID_INCOMING = 3
        private const val NOTIFICATION_ID_ACTIVE = 4
        const val CHANNEL_CALLS = "calls"

        const val ACTION_START_INCOMING = "com.organizer.chat.action.START_INCOMING_CALL"
        const val ACTION_START_ACTIVE = "com.organizer.chat.action.START_ACTIVE_CALL"
        const val ACTION_UPDATE_ACTIVE = "com.organizer.chat.action.UPDATE_ACTIVE_CALL"
        const val ACTION_ACCEPT_CALL = "com.organizer.chat.action.ACCEPT_CALL"
        const val ACTION_REJECT_CALL = "com.organizer.chat.action.REJECT_CALL"
        const val ACTION_END_CALL = "com.organizer.chat.action.END_CALL"
        const val ACTION_STOP = "com.organizer.chat.action.STOP_CALL_SERVICE"

        const val EXTRA_CALLER_NAME = "caller_name"
        const val EXTRA_CALLER_ID = "caller_id"
        const val EXTRA_WITH_CAMERA = "with_camera"
        const val EXTRA_CALL_DURATION = "call_duration"

        private var callActionCallback: CallActionCallback? = null

        fun setCallActionCallback(callback: CallActionCallback?) {
            callActionCallback = callback
        }

        fun startIncomingCall(context: Context, callerId: String, callerName: String, withCamera: Boolean) {
            val intent = Intent(context, CallService::class.java).apply {
                action = ACTION_START_INCOMING
                putExtra(EXTRA_CALLER_ID, callerId)
                putExtra(EXTRA_CALLER_NAME, callerName)
                putExtra(EXTRA_WITH_CAMERA, withCamera)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun startActiveCall(context: Context, remoteName: String) {
            val intent = Intent(context, CallService::class.java).apply {
                action = ACTION_START_ACTIVE
                putExtra(EXTRA_CALLER_NAME, remoteName)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun updateActiveCall(context: Context, durationSeconds: Int) {
            val intent = Intent(context, CallService::class.java).apply {
                action = ACTION_UPDATE_ACTIVE
                putExtra(EXTRA_CALL_DURATION, durationSeconds)
            }
            context.startService(intent)
        }

        fun stop(context: Context) {
            val intent = Intent(context, CallService::class.java).apply {
                action = ACTION_STOP
            }
            context.startService(intent)
        }
    }

    private var wakeLock: PowerManager.WakeLock? = null
    private var currentCallerId: String? = null
    private var currentCallerName: String? = null
    private var currentWithCamera: Boolean = false
    private var isIncomingCall = false

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "CallService onCreate")
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START_INCOMING -> {
                currentCallerId = intent.getStringExtra(EXTRA_CALLER_ID)
                currentCallerName = intent.getStringExtra(EXTRA_CALLER_NAME) ?: "Unknown"
                currentWithCamera = intent.getBooleanExtra(EXTRA_WITH_CAMERA, false)
                isIncomingCall = true
                startIncoming()
            }
            ACTION_START_ACTIVE -> {
                currentCallerName = intent.getStringExtra(EXTRA_CALLER_NAME) ?: "Unknown"
                isIncomingCall = false
                startActive()
            }
            ACTION_UPDATE_ACTIVE -> {
                val duration = intent.getIntExtra(EXTRA_CALL_DURATION, 0)
                updateActiveNotification(duration)
            }
            ACTION_ACCEPT_CALL -> {
                currentCallerId?.let { callerId ->
                    callActionCallback?.onAcceptCall(callerId, currentWithCamera)
                }
            }
            ACTION_REJECT_CALL -> {
                currentCallerId?.let { callerId ->
                    callActionCallback?.onRejectCall(callerId)
                }
                stopSelf()
            }
            ACTION_END_CALL -> {
                callActionCallback?.onEndCall()
                stopSelf()
            }
            ACTION_STOP -> {
                stop()
            }
        }
        return START_NOT_STICKY
    }

    private fun startIncoming() {
        Log.d(TAG, "Starting incoming call notification for $currentCallerName")
        acquireWakeLock()
        startForeground(NOTIFICATION_ID_INCOMING, createIncomingCallNotification())
    }

    private fun startActive() {
        Log.d(TAG, "Starting active call notification for $currentCallerName")
        acquireWakeLock()
        startForeground(NOTIFICATION_ID_ACTIVE, createActiveCallNotification(0))
    }

    private fun updateActiveNotification(durationSeconds: Int) {
        val notificationManager = getSystemService(NotificationManager::class.java)
        notificationManager.notify(NOTIFICATION_ID_ACTIVE, createActiveCallNotification(durationSeconds))
    }

    private fun stop() {
        Log.d(TAG, "Stopping CallService")
        releaseWakeLock()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun createIncomingCallNotification(): Notification {
        // Full-screen intent for when screen is locked
        val fullScreenIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("incoming_call", true)
            putExtra(EXTRA_CALLER_ID, currentCallerId)
            putExtra(EXTRA_CALLER_NAME, currentCallerName)
            putExtra(EXTRA_WITH_CAMERA, currentWithCamera)
        }
        val fullScreenPendingIntent = PendingIntent.getActivity(
            this,
            0,
            fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Accept action
        val acceptIntent = Intent(this, CallService::class.java).apply {
            action = ACTION_ACCEPT_CALL
        }
        val acceptPendingIntent = PendingIntent.getService(
            this,
            1,
            acceptIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Reject action
        val rejectIntent = Intent(this, CallService::class.java).apply {
            action = ACTION_REJECT_CALL
        }
        val rejectPendingIntent = PendingIntent.getService(
            this,
            2,
            rejectIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val callType = if (currentWithCamera) "Appel vidéo" else "Appel audio"

        return NotificationCompat.Builder(this, CHANNEL_CALLS)
            .setContentTitle(currentCallerName)
            .setContentText("$callType entrant...")
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setOngoing(true)
            .setAutoCancel(false)
            .setFullScreenIntent(fullScreenPendingIntent, true)
            .addAction(R.drawable.ic_launcher_foreground, "Accepter", acceptPendingIntent)
            .addAction(R.drawable.ic_launcher_foreground, "Refuser", rejectPendingIntent)
            .build()
    }

    private fun createActiveCallNotification(durationSeconds: Int): Notification {
        // Content intent - tap to return to app
        val contentIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val contentPendingIntent = PendingIntent.getActivity(
            this,
            0,
            contentIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // End call action
        val endCallIntent = Intent(this, CallService::class.java).apply {
            action = ACTION_END_CALL
        }
        val endCallPendingIntent = PendingIntent.getService(
            this,
            3,
            endCallIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val durationText = formatDuration(durationSeconds)

        return NotificationCompat.Builder(this, CHANNEL_CALLS)
            .setContentTitle("Appel en cours")
            .setContentText("$currentCallerName • $durationText")
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setOngoing(true)
            .setAutoCancel(false)
            .setContentIntent(contentPendingIntent)
            .addAction(R.drawable.ic_launcher_foreground, "Raccrocher", endCallPendingIntent)
            .build()
    }

    private fun formatDuration(seconds: Int): String {
        val minutes = seconds / 60
        val secs = seconds % 60
        return "%02d:%02d".format(minutes, secs)
    }

    private fun acquireWakeLock() {
        if (wakeLock != null) return

        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "OrganizerChat::CallWakeLock"
        ).apply {
            acquire(60 * 60 * 1000L) // 1 hour max
        }
        Log.d(TAG, "Wake lock acquired")
    }

    private fun releaseWakeLock() {
        wakeLock?.let {
            if (it.isHeld) {
                it.release()
                Log.d(TAG, "Wake lock released")
            }
        }
        wakeLock = null
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "CallService onDestroy")
        releaseWakeLock()
    }
}
