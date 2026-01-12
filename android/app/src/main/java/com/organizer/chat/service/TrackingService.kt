package com.organizer.chat.service

import android.app.Notification
import android.app.NotificationChannel
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
import com.google.android.gms.location.CurrentLocationRequest
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.organizer.chat.MainActivity
import com.organizer.chat.OrganizerApp
import com.organizer.chat.R
import com.organizer.chat.data.api.ApiClient
import com.organizer.chat.data.model.UpdateLocationRequest
import com.organizer.chat.data.repository.GeocodedAddress
import com.organizer.chat.data.repository.LocationRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import java.util.concurrent.TimeUnit

class TrackingService : Service() {

    companion object {
        private const val TAG = "TrackingService"
        private const val NOTIFICATION_ID = 2
        const val CHANNEL_TRACKING = "tracking"

        const val ACTION_START = "com.organizer.chat.action.START_TRACKING"
        const val ACTION_STOP = "com.organizer.chat.action.STOP_TRACKING"

        const val EXTRA_EXPIRES_AT = "expires_at"

        private const val UPDATE_INTERVAL_MS = 30_000L // 30 seconds

        fun startTracking(context: Context, expiresAtMillis: Long? = null) {
            val intent = Intent(context, TrackingService::class.java).apply {
                action = ACTION_START
                expiresAtMillis?.let { putExtra(EXTRA_EXPIRES_AT, it) }
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stopTracking(context: Context) {
            val intent = Intent(context, TrackingService::class.java).apply {
                action = ACTION_STOP
            }
            context.startService(intent)
        }
    }

    private val serviceScope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private val fusedLocationClient by lazy { LocationServices.getFusedLocationProviderClient(this) }
    private var wakeLock: PowerManager.WakeLock? = null
    private var expiresAt: Long? = null
    private var isTracking = false
    private lateinit var locationRepository: LocationRepository

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "TrackingService onCreate")
        createNotificationChannel()
        locationRepository = LocationRepository(this)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                val expiresAtExtra = intent.getLongExtra(EXTRA_EXPIRES_AT, -1)
                expiresAt = if (expiresAtExtra > 0) expiresAtExtra else null
                startTracking()
            }
            ACTION_STOP -> {
                stopTracking()
            }
        }
        return START_STICKY
    }

    private fun startTracking() {
        if (isTracking) {
            Log.d(TAG, "Already tracking")
            return
        }

        isTracking = true
        Log.d(TAG, "Starting tracking, expires at: $expiresAt")

        // Acquire wake lock to keep CPU active
        acquireWakeLock()

        // Start foreground notification
        startForeground(NOTIFICATION_ID, createNotification())

        // Start location updates loop
        serviceScope.launch {
            while (isActive && isTracking) {
                // Check expiration
                expiresAt?.let { expiry ->
                    if (System.currentTimeMillis() >= expiry) {
                        Log.d(TAG, "Tracking expired")
                        stopTracking()
                        return@launch
                    }
                }

                // Get and send location
                sendLocationUpdate()

                // Wait for next update
                delay(UPDATE_INTERVAL_MS)
            }
        }
    }

    private fun stopTracking() {
        if (!isTracking) {
            Log.d(TAG, "Not tracking")
            stopSelf()
            return
        }

        Log.d(TAG, "Stopping tracking")
        isTracking = false
        releaseWakeLock()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    @Suppress("MissingPermission")
    private suspend fun sendLocationUpdate() {
        try {
            val locationRequest = CurrentLocationRequest.Builder()
                .setPriority(Priority.PRIORITY_HIGH_ACCURACY)
                .setMaxUpdateAgeMillis(10_000) // Accept location up to 10s old for fresher positions
                .build()

            val location = fusedLocationClient.getCurrentLocation(locationRequest, null).await()

            if (location != null) {
                Log.d(TAG, "Got location: ${location.latitude}, ${location.longitude} (accuracy: ${location.accuracy})")

                // Reverse geocode
                val address = locationRepository.reverseGeocode(location.latitude, location.longitude)

                // Send to server
                val result = locationRepository.updateLocation(
                    lat = location.latitude,
                    lng = location.longitude,
                    accuracy = location.accuracy,
                    street = address?.street,
                    city = address?.city,
                    country = address?.country
                )

                if (result.isSuccess) {
                    Log.d(TAG, "Location sent successfully")
                    // Update notification with address
                    updateNotification(address)
                } else {
                    Log.e(TAG, "Failed to send location: ${result.exceptionOrNull()?.message}")
                }
            } else {
                Log.w(TAG, "Location is null")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error getting/sending location", e)
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_TRACKING,
                "Suivi en temps réel",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Notification affichée pendant le suivi de position"
                setShowBadge(false)
            }
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(address: GeocodedAddress? = null): Notification {
        val intent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val stopIntent = Intent(this, TrackingService::class.java).apply {
            action = ACTION_STOP
        }
        val stopPendingIntent = PendingIntent.getService(
            this,
            1,
            stopIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val contentText = if (address != null) {
            listOfNotNull(address.street, address.city).joinToString(", ")
                .ifEmpty { "Position en cours..." }
        } else {
            "Position en cours..."
        }

        return NotificationCompat.Builder(this, CHANNEL_TRACKING)
            .setContentTitle("Suivi actif")
            .setContentText(contentText)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .addAction(
                R.drawable.ic_launcher_foreground,
                "Arreter",
                stopPendingIntent
            )
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
    }

    private fun updateNotification(address: GeocodedAddress?) {
        val notificationManager = getSystemService(NotificationManager::class.java)
        notificationManager.notify(NOTIFICATION_ID, createNotification(address))
    }

    private fun acquireWakeLock() {
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager

        // Calculate timeout: requested duration + 5 min margin, or 4h max if no expiration
        val timeoutMs = expiresAt?.let { expiry ->
            val remaining = expiry - System.currentTimeMillis()
            if (remaining > 0) remaining + TimeUnit.MINUTES.toMillis(5) else TimeUnit.HOURS.toMillis(4)
        } ?: TimeUnit.HOURS.toMillis(4)

        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "OrganizerChat::TrackingWakeLock"
        ).apply {
            acquire(timeoutMs)
        }
        Log.d(TAG, "Wake lock acquired for ${timeoutMs / 1000 / 60} minutes")
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
        Log.d(TAG, "TrackingService onDestroy")
        isTracking = false
        releaseWakeLock()
        serviceScope.cancel()
    }
}
