package com.organizer.chat.data.socket

import android.util.Log
import com.organizer.chat.data.model.AppVersion
import com.organizer.chat.util.TokenManager
import io.socket.client.IO
import io.socket.client.Socket
import io.socket.emitter.Emitter
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import org.json.JSONObject

class SocketManager(private val tokenManager: TokenManager) {

    companion object {
        private const val TAG = "SocketManager"
        private const val SERVER_URL = "http://51.210.150.25:3001"
    }

    private var socket: Socket? = null

    // Events as SharedFlows
    private val _connectionState = MutableSharedFlow<ConnectionState>(replay = 1)
    val connectionState: SharedFlow<ConnectionState> = _connectionState.asSharedFlow()

    private val _newMessage = MutableSharedFlow<NewMessageEvent>(replay = 1, extraBufferCapacity = 10)
    val newMessage: SharedFlow<NewMessageEvent> = _newMessage.asSharedFlow()

    private val _userOnline = MutableSharedFlow<UserStatusEvent>(replay = 1, extraBufferCapacity = 5)
    val userOnline: SharedFlow<UserStatusEvent> = _userOnline.asSharedFlow()

    private val _userStatusChanged = MutableSharedFlow<UserStatusEvent>(replay = 1, extraBufferCapacity = 5)
    val userStatusChanged: SharedFlow<UserStatusEvent> = _userStatusChanged.asSharedFlow()

    private val _userOffline = MutableSharedFlow<UserOfflineEvent>()
    val userOffline: SharedFlow<UserOfflineEvent> = _userOffline.asSharedFlow()

    private val _typingStart = MutableSharedFlow<TypingEvent>(extraBufferCapacity = 5)
    val typingStart: SharedFlow<TypingEvent> = _typingStart.asSharedFlow()

    private val _typingStop = MutableSharedFlow<TypingEvent>(extraBufferCapacity = 5)
    val typingStop: SharedFlow<TypingEvent> = _typingStop.asSharedFlow()

    private val _messageRead = MutableSharedFlow<MessageReadEvent>()
    val messageRead: SharedFlow<MessageReadEvent> = _messageRead.asSharedFlow()

    private val _messageDeleted = MutableSharedFlow<MessageDeletedEvent>(replay = 1, extraBufferCapacity = 10)
    val messageDeleted: SharedFlow<MessageDeletedEvent> = _messageDeleted.asSharedFlow()

    private val _messageReacted = MutableSharedFlow<MessageReactedEvent>(replay = 1, extraBufferCapacity = 10)
    val messageReacted: SharedFlow<MessageReactedEvent> = _messageReacted.asSharedFlow()

    // Notes events
    private val _noteCreated = MutableSharedFlow<NoteEvent>(replay = 1, extraBufferCapacity = 10)
    val noteCreated: SharedFlow<NoteEvent> = _noteCreated.asSharedFlow()

    private val _noteUpdated = MutableSharedFlow<NoteEvent>(replay = 1, extraBufferCapacity = 10)
    val noteUpdated: SharedFlow<NoteEvent> = _noteUpdated.asSharedFlow()

    private val _noteDeleted = MutableSharedFlow<NoteDeletedEvent>(replay = 1, extraBufferCapacity = 10)
    val noteDeleted: SharedFlow<NoteDeletedEvent> = _noteDeleted.asSharedFlow()

    private val _labelCreated = MutableSharedFlow<LabelEvent>(replay = 1, extraBufferCapacity = 10)
    val labelCreated: SharedFlow<LabelEvent> = _labelCreated.asSharedFlow()

    private val _labelUpdated = MutableSharedFlow<LabelEvent>(replay = 1, extraBufferCapacity = 10)
    val labelUpdated: SharedFlow<LabelEvent> = _labelUpdated.asSharedFlow()

    private val _labelDeleted = MutableSharedFlow<LabelDeletedEvent>(replay = 1, extraBufferCapacity = 10)
    val labelDeleted: SharedFlow<LabelDeletedEvent> = _labelDeleted.asSharedFlow()

    // Location events
    private val _userLocationUpdated = MutableSharedFlow<UserLocationUpdatedEvent>(replay = 1, extraBufferCapacity = 10)
    val userLocationUpdated: SharedFlow<UserLocationUpdatedEvent> = _userLocationUpdated.asSharedFlow()

    // Tracking events
    private val _userTrackingChanged = MutableSharedFlow<UserTrackingChangedEvent>(replay = 1, extraBufferCapacity = 10)
    val userTrackingChanged: SharedFlow<UserTrackingChangedEvent> = _userTrackingChanged.asSharedFlow()

    private val _userTrackPoint = MutableSharedFlow<UserTrackPointEvent>(replay = 0, extraBufferCapacity = 50)
    val userTrackPoint: SharedFlow<UserTrackPointEvent> = _userTrackPoint.asSharedFlow()

    // Room events
    private val _roomCreated = MutableSharedFlow<RoomCreatedEvent>(replay = 0, extraBufferCapacity = 10)
    val roomCreated: SharedFlow<RoomCreatedEvent> = _roomCreated.asSharedFlow()

    private val _roomUpdated = MutableSharedFlow<RoomUpdatedEvent>(replay = 0, extraBufferCapacity = 10)
    val roomUpdated: SharedFlow<RoomUpdatedEvent> = _roomUpdated.asSharedFlow()

    private val _roomDeleted = MutableSharedFlow<RoomDeletedEvent>(replay = 0, extraBufferCapacity = 10)
    val roomDeleted: SharedFlow<RoomDeletedEvent> = _roomDeleted.asSharedFlow()

    // Unread count events
    private val _unreadUpdated = MutableSharedFlow<UnreadUpdatedEvent>(replay = 1, extraBufferCapacity = 10)
    val unreadUpdated: SharedFlow<UnreadUpdatedEvent> = _unreadUpdated.asSharedFlow()

    fun connect(versionName: String? = null, versionCode: Int? = null) {
        val token = tokenManager.getTokenSync()
        if (token == null) {
            Log.e(TAG, "Cannot connect: no token available")
            return
        }

        try {
            val authMap = mutableMapOf("token" to token)

            // Ajouter la version de l'app si fournie
            if (versionName != null && versionCode != null) {
                authMap["appVersionName"] = versionName
                authMap["appVersionCode"] = versionCode.toString()
                Log.d(TAG, "Connecting with app version: $versionName ($versionCode)")
            }

            val options = IO.Options().apply {
                auth = authMap
                reconnection = true
                reconnectionAttempts = 5
                reconnectionDelay = 1000
            }

            socket = IO.socket(SERVER_URL, options)
            setupListeners()
            socket?.connect()

            Log.d(TAG, "Connecting to socket...")
        } catch (e: Exception) {
            Log.e(TAG, "Socket connection error", e)
            _connectionState.tryEmit(ConnectionState.Error(e.message ?: "Unknown error"))
        }
    }

    private fun setupListeners() {
        socket?.apply {
            on(Socket.EVENT_CONNECT) {
                Log.d(TAG, "Socket connected")
                _connectionState.tryEmit(ConnectionState.Connected)
            }

            on(Socket.EVENT_DISCONNECT) {
                Log.d(TAG, "Socket disconnected")
                _connectionState.tryEmit(ConnectionState.Disconnected)
            }

            on(Socket.EVENT_CONNECT_ERROR) { args ->
                val error = args.firstOrNull()?.toString() ?: "Unknown error"
                Log.e(TAG, "Socket connection error: $error")
                _connectionState.tryEmit(ConnectionState.Error(error))
            }

            on("message:new") { args ->
                try {
                    val data = args[0] as JSONObject
                    // Lightweight payload: only notification data, full message fetched via API
                    val event = NewMessageEvent(
                        from = data.getString("from"),
                        fromName = data.optString("fromName", "Utilisateur"),
                        roomName = data.optString("roomName", "Chat"),
                        roomId = data.getString("roomId"),
                        messageId = data.getString("messageId"),
                        preview = data.optString("preview", "Nouveau message")
                    )
                    _newMessage.tryEmit(event)
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing message:new", e)
                }
            }

            on("user:online") { args ->
                try {
                    val data = args[0] as JSONObject
                    // Parse appVersion if present
                    val appVersion = if (!data.isNull("appVersion")) {
                        val versionObj = data.getJSONObject("appVersion")
                        AppVersion(
                            versionName = versionObj.getString("versionName"),
                            versionCode = versionObj.getInt("versionCode"),
                            updatedAt = if (versionObj.isNull("updatedAt")) null else versionObj.optString("updatedAt")
                        )
                    } else null

                    val event = UserStatusEvent(
                        userId = data.getString("userId"),
                        status = data.optString("status", "available"),
                        statusMessage = if (data.isNull("statusMessage")) null else data.optString("statusMessage"),
                        statusExpiresAt = if (data.isNull("statusExpiresAt")) null else data.optString("statusExpiresAt"),
                        isMuted = data.optBoolean("isMuted", false),
                        appVersion = appVersion
                    )
                    _userOnline.tryEmit(event)
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing user:online", e)
                }
            }

            on("user:status-changed") { args ->
                try {
                    val data = args[0] as JSONObject
                    val event = UserStatusEvent(
                        userId = data.getString("userId"),
                        status = data.optString("status", "available"),
                        statusMessage = if (data.isNull("statusMessage")) null else data.optString("statusMessage"),
                        statusExpiresAt = if (data.isNull("statusExpiresAt")) null else data.optString("statusExpiresAt"),
                        isMuted = data.optBoolean("isMuted", false)
                    )
                    Log.d(TAG, "User status changed: ${event.userId} -> ${event.status} (${event.statusMessage})")
                    _userStatusChanged.tryEmit(event)
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing user:status-changed", e)
                }
            }

            on("user:offline") { args ->
                try {
                    val data = args[0] as JSONObject
                    val event = UserOfflineEvent(userId = data.getString("userId"))
                    _userOffline.tryEmit(event)
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing user:offline", e)
                }
            }

            on("typing:start") { args ->
                try {
                    val data = args[0] as JSONObject
                    val event = TypingEvent(
                        from = data.getString("from"),
                        roomId = data.getString("roomId")
                    )
                    _typingStart.tryEmit(event)
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing typing:start", e)
                }
            }

            on("typing:stop") { args ->
                try {
                    val data = args[0] as JSONObject
                    val event = TypingEvent(
                        from = data.getString("from"),
                        roomId = data.getString("roomId")
                    )
                    _typingStop.tryEmit(event)
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing typing:stop", e)
                }
            }

            on("message:read") { args ->
                try {
                    val data = args[0] as JSONObject
                    val messageIdsArray = data.getJSONArray("messageIds")
                    val messageIds = (0 until messageIdsArray.length()).map {
                        messageIdsArray.getString(it)
                    }
                    val event = MessageReadEvent(
                        from = data.getString("from"),
                        roomId = data.getString("roomId"),
                        messageIds = messageIds
                    )
                    _messageRead.tryEmit(event)
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing message:read", e)
                }
            }

            on("message:deleted") { args ->
                try {
                    val data = args[0] as JSONObject
                    val event = MessageDeletedEvent(
                        from = data.getString("from"),
                        roomId = data.getString("roomId"),
                        messageId = data.getString("messageId")
                    )
                    Log.d(TAG, "Message deleted: ${event.messageId} in room ${event.roomId}")
                    _messageDeleted.tryEmit(event)
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing message:deleted", e)
                }
            }

            on("message:reacted") { args ->
                try {
                    val data = args[0] as JSONObject
                    val event = MessageReactedEvent(
                        from = data.getString("from"),
                        roomId = data.getString("roomId"),
                        messageId = data.getString("messageId"),
                        emoji = data.getString("emoji"),
                        action = data.getString("action")
                    )
                    Log.d(TAG, "Message reacted: ${event.messageId} with ${event.emoji} (${event.action})")
                    _messageReacted.tryEmit(event)
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing message:reacted", e)
                }
            }

            // Notes events
            on("note:created") { args ->
                try {
                    val data = args[0] as JSONObject
                    val noteJson = data.getJSONObject("note")
                    val createdBy = data.optString("createdBy", "")
                    val event = NoteEvent(
                        noteId = noteJson.getString("_id"),
                        triggeredBy = createdBy
                    )
                    Log.d(TAG, "Note created: ${event.noteId} by ${event.triggeredBy}")
                    _noteCreated.tryEmit(event)
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing note:created", e)
                }
            }

            on("note:updated") { args ->
                try {
                    val data = args[0] as JSONObject
                    val noteJson = data.getJSONObject("note")
                    val updatedBy = data.optString("updatedBy", "")
                    val event = NoteEvent(
                        noteId = noteJson.getString("_id"),
                        triggeredBy = updatedBy
                    )
                    Log.d(TAG, "Note updated: ${event.noteId} by ${event.triggeredBy}")
                    _noteUpdated.tryEmit(event)
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing note:updated", e)
                }
            }

            on("note:deleted") { args ->
                try {
                    val data = args[0] as JSONObject
                    val deletedBy = data.optString("deletedBy", "")
                    val event = NoteDeletedEvent(
                        noteId = data.getString("noteId"),
                        deletedBy = deletedBy
                    )
                    Log.d(TAG, "Note deleted: ${event.noteId} by ${event.deletedBy}")
                    _noteDeleted.tryEmit(event)
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing note:deleted", e)
                }
            }

            on("label:created") { args ->
                try {
                    val data = args[0] as JSONObject
                    val labelJson = data.getJSONObject("label")
                    val event = LabelEvent(labelId = labelJson.getString("_id"))
                    Log.d(TAG, "Label created: ${event.labelId}")
                    _labelCreated.tryEmit(event)
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing label:created", e)
                }
            }

            on("label:updated") { args ->
                try {
                    val data = args[0] as JSONObject
                    val labelJson = data.getJSONObject("label")
                    val event = LabelEvent(labelId = labelJson.getString("_id"))
                    Log.d(TAG, "Label updated: ${event.labelId}")
                    _labelUpdated.tryEmit(event)
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing label:updated", e)
                }
            }

            on("label:deleted") { args ->
                try {
                    val data = args[0] as JSONObject
                    val event = LabelDeletedEvent(labelId = data.getString("labelId"))
                    Log.d(TAG, "Label deleted: ${event.labelId}")
                    _labelDeleted.tryEmit(event)
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing label:deleted", e)
                }
            }

            // Location events
            on("user:location-updated") { args ->
                try {
                    val data = args[0] as JSONObject
                    val locationObj = data.optJSONObject("location")
                    val event = UserLocationUpdatedEvent(
                        userId = data.getString("userId"),
                        username = data.optString("username", ""),
                        displayName = data.optString("displayName", ""),
                        isOnline = data.optBoolean("isOnline", false),
                        location = locationObj?.let {
                            UserLocationData(
                                lat = it.getDouble("lat"),
                                lng = it.getDouble("lng"),
                                street = if (it.isNull("street")) null else it.optString("street"),
                                city = if (it.isNull("city")) null else it.optString("city"),
                                country = if (it.isNull("country")) null else it.optString("country"),
                                updatedAt = it.optString("updatedAt")
                            )
                        }
                    )
                    Log.d(TAG, "User location updated: ${event.userId}")
                    _userLocationUpdated.tryEmit(event)
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing user:location-updated", e)
                }
            }

            // Tracking events
            on("user:tracking-changed") { args ->
                try {
                    val data = args[0] as JSONObject
                    val event = UserTrackingChangedEvent(
                        userId = data.getString("userId"),
                        username = data.optString("username", ""),
                        displayName = data.optString("displayName", ""),
                        isTracking = data.getBoolean("isTracking"),
                        trackingExpiresAt = if (data.isNull("trackingExpiresAt")) null else data.optString("trackingExpiresAt"),
                        trackId = if (data.isNull("trackId")) null else data.optString("trackId")
                    )
                    Log.d(TAG, "User tracking changed: ${event.userId} -> ${event.isTracking}")
                    _userTrackingChanged.tryEmit(event)
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing user:tracking-changed", e)
                }
            }

            on("user:track-point") { args ->
                try {
                    val data = args[0] as JSONObject
                    val pointObj = data.getJSONObject("point")
                    val event = UserTrackPointEvent(
                        userId = data.getString("userId"),
                        trackId = data.getString("trackId"),
                        point = TrackPointData(
                            lat = pointObj.getDouble("lat"),
                            lng = pointObj.getDouble("lng"),
                            accuracy = if (pointObj.isNull("accuracy")) null else pointObj.optDouble("accuracy").toFloat(),
                            timestamp = pointObj.optString("timestamp")
                        )
                    )
                    Log.d(TAG, "Track point received: ${event.userId} at ${event.point.lat},${event.point.lng}")
                    _userTrackPoint.tryEmit(event)
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing user:track-point", e)
                }
            }

            // Room events
            on("room:created") { args ->
                try {
                    val data = args[0] as JSONObject
                    val roomJson = data.getJSONObject("room")
                    val event = RoomCreatedEvent(
                        roomId = roomJson.getString("_id"),
                        roomName = roomJson.getString("name"),
                        roomType = roomJson.optString("type", "public")
                    )
                    Log.d(TAG, "Room created: ${event.roomName} (${event.roomId})")
                    _roomCreated.tryEmit(event)
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing room:created", e)
                }
            }

            on("room:updated") { args ->
                try {
                    val data = args[0] as JSONObject
                    val roomJson = data.getJSONObject("room")
                    val event = RoomUpdatedEvent(
                        roomId = roomJson.getString("_id"),
                        roomName = roomJson.getString("name")
                    )
                    Log.d(TAG, "Room updated: ${event.roomName} (${event.roomId})")
                    _roomUpdated.tryEmit(event)
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing room:updated", e)
                }
            }

            on("room:deleted") { args ->
                try {
                    val data = args[0] as JSONObject
                    val event = RoomDeletedEvent(
                        roomId = data.getString("roomId"),
                        roomName = data.optString("roomName", "")
                    )
                    Log.d(TAG, "Room deleted: ${event.roomName} (${event.roomId})")
                    _roomDeleted.tryEmit(event)
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing room:deleted", e)
                }
            }

            // Unread count update
            on("unread:updated") { args ->
                try {
                    val data = args[0] as JSONObject
                    val event = UnreadUpdatedEvent(
                        roomId = data.getString("roomId"),
                        unreadCount = data.getInt("unreadCount")
                    )
                    Log.d(TAG, "Unread updated: room=${event.roomId}, count=${event.unreadCount}")
                    _unreadUpdated.tryEmit(event)
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing unread:updated", e)
                }
            }
        }
    }

    fun disconnect() {
        socket?.disconnect()
        socket?.off()
        socket = null
        _connectionState.tryEmit(ConnectionState.Disconnected)
    }

    fun joinRoom(roomId: String) {
        socket?.emit("room:join", JSONObject().put("roomId", roomId))
    }

    fun leaveRoom(roomId: String) {
        socket?.emit("room:leave", JSONObject().put("roomId", roomId))
    }

    fun notifyNewMessage(roomId: String, messageId: String) {
        socket?.emit("message:notify", JSONObject().apply {
            put("roomId", roomId)
            put("messageId", messageId)
        })
    }

    fun notifyTypingStart(roomId: String) {
        socket?.emit("typing:start", JSONObject().put("roomId", roomId))
    }

    fun notifyTypingStop(roomId: String) {
        socket?.emit("typing:stop", JSONObject().put("roomId", roomId))
    }

    fun notifyReaction(roomId: String, messageId: String, emoji: String, action: String) {
        socket?.emit("message:react", JSONObject().apply {
            put("roomId", roomId)
            put("messageId", messageId)
            put("emoji", emoji)
            put("action", action)
        })
    }

    fun notifyMessageDelete(roomId: String, messageId: String) {
        socket?.emit("message:delete", JSONObject().apply {
            put("roomId", roomId)
            put("messageId", messageId)
        })
    }

    fun subscribeToNotes() {
        socket?.emit("note:subscribe")
        Log.d(TAG, "Subscribed to notes")
    }

    fun unsubscribeFromNotes() {
        socket?.emit("note:unsubscribe")
        Log.d(TAG, "Unsubscribed from notes")
    }

    fun subscribeToLocations() {
        socket?.emit("location:subscribe")
        Log.d(TAG, "Subscribed to locations")
    }

    fun unsubscribeFromLocations() {
        socket?.emit("location:unsubscribe")
        Log.d(TAG, "Unsubscribed from locations")
    }

    fun isConnected(): Boolean = socket?.connected() == true
}

// Event classes
sealed class ConnectionState {
    object Connected : ConnectionState()
    object Disconnected : ConnectionState()
    data class Error(val message: String) : ConnectionState()
}

// Lightweight event: only notification data, full message fetched via API
data class NewMessageEvent(
    val from: String,
    val fromName: String = "Utilisateur",
    val roomName: String = "Chat",
    val roomId: String,
    val messageId: String,
    val preview: String = "Nouveau message"
)

data class UserStatusEvent(
    val userId: String,
    val status: String,
    val statusMessage: String?,
    val statusExpiresAt: String?,
    val isMuted: Boolean,
    val appVersion: AppVersion? = null
)

data class UserOfflineEvent(
    val userId: String
)

data class TypingEvent(
    val from: String,
    val roomId: String
)

data class MessageReadEvent(
    val from: String,
    val roomId: String,
    val messageIds: List<String>
)

data class MessageDeletedEvent(
    val from: String,
    val roomId: String,
    val messageId: String
)

data class MessageReactedEvent(
    val from: String,
    val roomId: String,
    val messageId: String,
    val emoji: String,
    val action: String
)

// Notes events
data class NoteEvent(
    val noteId: String,
    val triggeredBy: String = "" // userId who triggered the event
)

data class NoteDeletedEvent(
    val noteId: String,
    val deletedBy: String = ""
)

data class LabelEvent(
    val labelId: String
)

data class LabelDeletedEvent(
    val labelId: String
)

// Location events
data class UserLocationUpdatedEvent(
    val userId: String,
    val username: String,
    val displayName: String,
    val isOnline: Boolean,
    val location: UserLocationData?
)

data class UserLocationData(
    val lat: Double,
    val lng: Double,
    val street: String?,
    val city: String?,
    val country: String?,
    val updatedAt: String?
)

// Room events
data class RoomCreatedEvent(
    val roomId: String,
    val roomName: String,
    val roomType: String
)

data class RoomUpdatedEvent(
    val roomId: String,
    val roomName: String
)

data class RoomDeletedEvent(
    val roomId: String,
    val roomName: String
)

// Unread count events
data class UnreadUpdatedEvent(
    val roomId: String,
    val unreadCount: Int
)

// Tracking events
data class UserTrackingChangedEvent(
    val userId: String,
    val username: String,
    val displayName: String,
    val isTracking: Boolean,
    val trackingExpiresAt: String?,
    val trackId: String?
)

data class UserTrackPointEvent(
    val userId: String,
    val trackId: String,
    val point: TrackPointData
)

data class TrackPointData(
    val lat: Double,
    val lng: Double,
    val accuracy: Float?,
    val timestamp: String?
)
