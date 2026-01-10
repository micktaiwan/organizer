package com.organizer.chat.service

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.Binder
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.organizer.chat.MainActivity
import com.organizer.chat.OrganizerApp
import com.organizer.chat.R
import com.organizer.chat.data.socket.NewMessageEvent
import com.organizer.chat.data.socket.SocketManager
import com.organizer.chat.util.TokenManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class ChatService : Service() {

    companion object {
        private const val TAG = "ChatService"
        private const val SERVICE_NOTIFICATION_ID = 1
        private const val MESSAGE_NOTIFICATION_ID_BASE = 1000
        const val CHANNEL_SERVICE = "service"
        const val CHANNEL_MESSAGES = "messages"
    }

    private val binder = ChatBinder()
    private val serviceScope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    private lateinit var tokenManager: TokenManager
    lateinit var socketManager: SocketManager
        private set

    // Track if app is in foreground
    private val _isAppInForeground = MutableStateFlow(false)
    val isAppInForeground: StateFlow<Boolean> = _isAppInForeground.asStateFlow()

    // Relay messages from socket to UI
    private val _messages = MutableSharedFlow<NewMessageEvent>(replay = 1, extraBufferCapacity = 50)
    val messages: SharedFlow<NewMessageEvent> = _messages.asSharedFlow()

    // Track current room for notification filtering
    private var currentRoomId: String? = null

    // Cache room names for notifications
    private val roomNames = mutableMapOf<String, String>()

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "ChatService onCreate")

        tokenManager = (application as OrganizerApp).tokenManager
        socketManager = SocketManager(tokenManager)

        startForeground(SERVICE_NOTIFICATION_ID, createServiceNotification())

        // Only connect if user is logged in
        if (tokenManager.getTokenSync() != null) {
            socketManager.connect()
            observeSocketMessages()
        }
    }

    private fun observeSocketMessages() {
        serviceScope.launch {
            socketManager.newMessage.collect { event ->
                Log.d(TAG, "New message received: roomId=${event.roomId}, from=${event.from}")

                // Relay to UI
                _messages.emit(event)

                // Show notification if app is in background or in different room
                if (!_isAppInForeground.value || currentRoomId != event.roomId) {
                    showMessageNotification(event)
                }
            }
        }
    }

    private fun createServiceNotification(): Notification {
        val intent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_SERVICE)
            .setContentTitle("Organizer Chat")
            .setContentText("Connecte au serveur")
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setSilent(true)
            .build()
    }

    private fun showMessageNotification(event: NewMessageEvent) {
        val roomName = getRoomName(event.roomId)
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("roomId", event.roomId)
            putExtra("roomName", roomName)
        }
        val pendingIntent = PendingIntent.getActivity(
            this, event.roomId.hashCode(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, CHANNEL_MESSAGES)
            .setContentTitle("Organizer")
            .setContentText("Nouveau message dans $roomName")
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .build()

        val notificationManager = getSystemService(NotificationManager::class.java)
        notificationManager.notify(
            MESSAGE_NOTIFICATION_ID_BASE + event.roomId.hashCode(),
            notification
        )
    }

    fun setAppInForeground(inForeground: Boolean) {
        _isAppInForeground.value = inForeground
    }

    fun setCurrentRoom(roomId: String?, roomName: String? = null) {
        currentRoomId = roomId
        // Store room name for future notifications
        if (roomId != null && roomName != null) {
            roomNames[roomId] = roomName
        }
        // Clear notifications for this room when entering it
        if (roomId != null) {
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.cancel(MESSAGE_NOTIFICATION_ID_BASE + roomId.hashCode())
        }
    }

    fun getRoomName(roomId: String): String {
        return roomNames[roomId] ?: "Chat"
    }

    fun reconnectIfNeeded() {
        if (!socketManager.isConnected() && tokenManager.getTokenSync() != null) {
            Log.d(TAG, "Reconnecting socket...")
            socketManager.connect()
        }
    }

    override fun onBind(intent: Intent?): IBinder {
        return binder
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "ChatService onDestroy")
        socketManager.disconnect()
        serviceScope.cancel()
    }

    inner class ChatBinder : Binder() {
        fun getService(): ChatService = this@ChatService
    }
}
