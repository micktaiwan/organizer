package com.organizer.chat

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.organizer.chat.data.api.ApiClient
import com.organizer.chat.service.CallService
import com.organizer.chat.service.ChatService
import com.organizer.chat.service.TrackingService
import com.organizer.chat.service.VideoRecorderService
import com.organizer.chat.service.TrackSyncManager
import com.organizer.chat.util.TokenManager

class OrganizerApp : Application() {

    lateinit var tokenManager: TokenManager
        private set

    override fun onCreate() {
        super.onCreate()

        // Initialize TokenManager first
        tokenManager = TokenManager(applicationContext)

        // Initialize ApiClient with TokenManager
        ApiClient.initialize(tokenManager)

        // Create notification channels
        createNotificationChannels()

        // Start network monitoring for track sync
        TrackSyncManager.getInstance(this).startNetworkMonitoring()
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = getSystemService(NotificationManager::class.java)

            // Service channel (low priority, silent)
            val serviceChannel = NotificationChannel(
                ChatService.CHANNEL_SERVICE,
                "Service Chat",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Service de connexion au chat"
                setShowBadge(false)
            }

            // Messages channel (high priority, with sound)
            val messagesChannel = NotificationChannel(
                ChatService.CHANNEL_MESSAGES,
                "Messages",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Notifications pour les nouveaux messages"
                enableVibration(true)
                setShowBadge(true)
            }

            // Tracking channel (low priority, silent)
            val trackingChannel = NotificationChannel(
                TrackingService.CHANNEL_TRACKING,
                "Suivi en temps réel",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Notification affichée pendant le suivi de position"
                setShowBadge(false)
            }

            // Calls channel (high priority for heads-up notifications)
            val callsChannel = NotificationChannel(
                CallService.CHANNEL_CALLS,
                "Appels",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Notifications pour les appels entrants et en cours"
                enableVibration(true)
                setShowBadge(true)
            }

            // Recording channel (low priority, silent)
            val recordingChannel = NotificationChannel(
                VideoRecorderService.CHANNEL_RECORDING,
                "Enregistrement",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Notification affichée pendant l'enregistrement d'écran"
                setShowBadge(false)
            }

            notificationManager.createNotificationChannels(
                listOf(serviceChannel, messagesChannel, trackingChannel, callsChannel, recordingChannel)
            )
        }
    }
}
