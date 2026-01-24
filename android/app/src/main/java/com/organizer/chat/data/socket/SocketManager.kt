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

    private val _newMessage = MutableSharedFlow<NewMessageEvent>(extraBufferCapacity = 10)
    val newMessage: SharedFlow<NewMessageEvent> = _newMessage.asSharedFlow()

    private val _userOnline = MutableSharedFlow<UserStatusEvent>(extraBufferCapacity = 5)
    val userOnline: SharedFlow<UserStatusEvent> = _userOnline.asSharedFlow()

    private val _userStatusChanged = MutableSharedFlow<UserStatusEvent>(extraBufferCapacity = 5)
    val userStatusChanged: SharedFlow<UserStatusEvent> = _userStatusChanged.asSharedFlow()

    private val _userOffline = MutableSharedFlow<UserOfflineEvent>(extraBufferCapacity = 5)
    val userOffline: SharedFlow<UserOfflineEvent> = _userOffline.asSharedFlow()

    private val _typingStart = MutableSharedFlow<TypingEvent>(extraBufferCapacity = 5)
    val typingStart: SharedFlow<TypingEvent> = _typingStart.asSharedFlow()

    private val _typingStop = MutableSharedFlow<TypingEvent>(extraBufferCapacity = 5)
    val typingStop: SharedFlow<TypingEvent> = _typingStop.asSharedFlow()

    private val _messageRead = MutableSharedFlow<MessageReadEvent>(extraBufferCapacity = 10)
    val messageRead: SharedFlow<MessageReadEvent> = _messageRead.asSharedFlow()

    private val _messageDeleted = MutableSharedFlow<MessageDeletedEvent>(extraBufferCapacity = 10)
    val messageDeleted: SharedFlow<MessageDeletedEvent> = _messageDeleted.asSharedFlow()

    private val _messageReacted = MutableSharedFlow<MessageReactedEvent>(extraBufferCapacity = 10)
    val messageReacted: SharedFlow<MessageReactedEvent> = _messageReacted.asSharedFlow()

    // Notes events
    private val _noteCreated = MutableSharedFlow<NoteEvent>(extraBufferCapacity = 10)
    val noteCreated: SharedFlow<NoteEvent> = _noteCreated.asSharedFlow()

    private val _noteUpdated = MutableSharedFlow<NoteEvent>(extraBufferCapacity = 10)
    val noteUpdated: SharedFlow<NoteEvent> = _noteUpdated.asSharedFlow()

    private val _noteDeleted = MutableSharedFlow<NoteDeletedEvent>(extraBufferCapacity = 10)
    val noteDeleted: SharedFlow<NoteDeletedEvent> = _noteDeleted.asSharedFlow()

    private val _labelCreated = MutableSharedFlow<LabelEvent>(extraBufferCapacity = 10)
    val labelCreated: SharedFlow<LabelEvent> = _labelCreated.asSharedFlow()

    private val _labelUpdated = MutableSharedFlow<LabelEvent>(extraBufferCapacity = 10)
    val labelUpdated: SharedFlow<LabelEvent> = _labelUpdated.asSharedFlow()

    private val _labelDeleted = MutableSharedFlow<LabelDeletedEvent>(extraBufferCapacity = 10)
    val labelDeleted: SharedFlow<LabelDeletedEvent> = _labelDeleted.asSharedFlow()

    // Location events
    private val _userLocationUpdated = MutableSharedFlow<UserLocationUpdatedEvent>(extraBufferCapacity = 10)
    val userLocationUpdated: SharedFlow<UserLocationUpdatedEvent> = _userLocationUpdated.asSharedFlow()

    // Tracking events
    private val _userTrackingChanged = MutableSharedFlow<UserTrackingChangedEvent>(extraBufferCapacity = 10)
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
    private val _unreadUpdated = MutableSharedFlow<UnreadUpdatedEvent>(extraBufferCapacity = 10)
    val unreadUpdated: SharedFlow<UnreadUpdatedEvent> = _unreadUpdated.asSharedFlow()

    // WebRTC signaling events
    private val _webrtcOffer = MutableSharedFlow<WebRTCOfferEvent>(extraBufferCapacity = 5)
    val webrtcOffer: SharedFlow<WebRTCOfferEvent> = _webrtcOffer.asSharedFlow()

    private val _webrtcAnswer = MutableSharedFlow<WebRTCAnswerEvent>(extraBufferCapacity = 5)
    val webrtcAnswer: SharedFlow<WebRTCAnswerEvent> = _webrtcAnswer.asSharedFlow()

    private val _webrtcIceCandidate = MutableSharedFlow<WebRTCIceCandidateEvent>(extraBufferCapacity = 20)
    val webrtcIceCandidate: SharedFlow<WebRTCIceCandidateEvent> = _webrtcIceCandidate.asSharedFlow()

    private val _webrtcClose = MutableSharedFlow<WebRTCCloseEvent>(extraBufferCapacity = 5)
    val webrtcClose: SharedFlow<WebRTCCloseEvent> = _webrtcClose.asSharedFlow()

    // Call signaling events
    private val _callRequest = MutableSharedFlow<CallRequestEvent>(extraBufferCapacity = 5)
    val callRequest: SharedFlow<CallRequestEvent> = _callRequest.asSharedFlow()

    private val _callAccept = MutableSharedFlow<CallAcceptEvent>(extraBufferCapacity = 5)
    val callAccept: SharedFlow<CallAcceptEvent> = _callAccept.asSharedFlow()

    private val _callReject = MutableSharedFlow<CallRejectEvent>(extraBufferCapacity = 5)
    val callReject: SharedFlow<CallRejectEvent> = _callReject.asSharedFlow()

    private val _callEnd = MutableSharedFlow<CallEndEvent>(extraBufferCapacity = 5)
    val callEnd: SharedFlow<CallEndEvent> = _callEnd.asSharedFlow()

    private val _callToggleCamera = MutableSharedFlow<CallToggleCameraEvent>(replay = 0, extraBufferCapacity = 1)
    val callToggleCamera: SharedFlow<CallToggleCameraEvent> = _callToggleCamera.asSharedFlow()

    private val _callAnsweredElsewhere = MutableSharedFlow<CallAnsweredElsewhereEvent>(extraBufferCapacity = 5)
    val callAnsweredElsewhere: SharedFlow<CallAnsweredElsewhereEvent> = _callAnsweredElsewhere.asSharedFlow()

    fun connect(versionName: String? = null, versionCode: Int? = null) {
        // Guard against multiple connections (BUG-003 fix)
        if (socket?.connected() == true) {
            Log.d(TAG, "Socket already connected, skipping")
            return
        }

        // Clean up existing socket if not connected
        socket?.let {
            Log.d(TAG, "Cleaning up existing disconnected socket")
            it.off()
            it.disconnect()
        }

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
                    Log.d(TAG, "Message read by ${event.from}: ${event.messageIds.size} messages in room ${event.roomId}")
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

            // WebRTC signaling
            on("webrtc:offer") { args ->
                try {
                    val data = args[0] as JSONObject
                    // offer is an object with { type, sdp }
                    val offerObj = data.getJSONObject("offer")
                    val event = WebRTCOfferEvent(
                        from = data.getString("from"),
                        fromUsername = data.optString("fromUsername", ""),
                        offer = offerObj.getString("sdp")
                    )
                    Log.d(TAG, "WebRTC offer from ${event.from}")
                    _webrtcOffer.tryEmit(event)
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing webrtc:offer", e)
                }
            }

            on("webrtc:answer") { args ->
                try {
                    val data = args[0] as JSONObject
                    // answer is an object with { type, sdp }
                    val answerObj = data.getJSONObject("answer")
                    val event = WebRTCAnswerEvent(
                        from = data.getString("from"),
                        answer = answerObj.getString("sdp")
                    )
                    Log.d(TAG, "WebRTC answer from ${event.from}")
                    _webrtcAnswer.tryEmit(event)
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing webrtc:answer", e)
                }
            }

            on("webrtc:ice-candidate") { args ->
                try {
                    val data = args[0] as JSONObject
                    // candidate is an object with { candidate, sdpMid, sdpMLineIndex }
                    val candidateObj = data.getJSONObject("candidate")
                    val event = WebRTCIceCandidateEvent(
                        from = data.getString("from"),
                        candidate = candidateObj.getString("candidate"),
                        sdpMid = candidateObj.optString("sdpMid", ""),
                        sdpMLineIndex = candidateObj.optInt("sdpMLineIndex", 0)
                    )
                    Log.d(TAG, "WebRTC ICE candidate from ${event.from}: ${event.candidate.take(50)}...")
                    _webrtcIceCandidate.tryEmit(event)
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing webrtc:ice-candidate", e)
                }
            }

            on("webrtc:close") { args ->
                try {
                    val data = args[0] as JSONObject
                    val event = WebRTCCloseEvent(from = data.getString("from"))
                    Log.d(TAG, "WebRTC close from ${event.from}")
                    _webrtcClose.tryEmit(event)
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing webrtc:close", e)
                }
            }

            // Call signaling
            on("call:request") { args ->
                try {
                    val data = args[0] as JSONObject
                    val event = CallRequestEvent(
                        from = data.getString("from"),
                        fromUsername = data.optString("fromUsername", ""),
                        withCamera = data.optBoolean("withCamera", false)
                    )
                    Log.d(TAG, "Call request from ${event.from} (camera=${event.withCamera})")
                    _callRequest.tryEmit(event)
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing call:request", e)
                }
            }

            on("call:accept") { args ->
                try {
                    val data = args[0] as JSONObject
                    val event = CallAcceptEvent(
                        from = data.getString("from"),
                        withCamera = data.optBoolean("withCamera", false)
                    )
                    Log.d(TAG, "Call accepted by ${event.from}")
                    _callAccept.tryEmit(event)
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing call:accept", e)
                }
            }

            on("call:reject") { args ->
                try {
                    val data = args[0] as JSONObject
                    val event = CallRejectEvent(from = data.getString("from"))
                    Log.d(TAG, "Call rejected by ${event.from}")
                    _callReject.tryEmit(event)
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing call:reject", e)
                }
            }

            on("call:end") { args ->
                try {
                    val data = args[0] as JSONObject
                    val event = CallEndEvent(from = data.getString("from"))
                    Log.d(TAG, "Call ended by ${event.from}")
                    _callEnd.tryEmit(event)
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing call:end", e)
                }
            }

            on("call:toggle-camera") { args ->
                try {
                    val data = args[0] as JSONObject
                    val event = CallToggleCameraEvent(
                        from = data.getString("from"),
                        enabled = data.getBoolean("enabled")
                    )
                    Log.d(TAG, "Received call:toggle-camera from ${event.from}, enabled=${event.enabled}")
                    _callToggleCamera.tryEmit(event)
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing call:toggle-camera", e)
                }
            }

            on("call:answered-elsewhere") { args ->
                try {
                    val data = args[0] as JSONObject
                    val event = CallAnsweredElsewhereEvent(
                        answeredBy = data.optString("answeredBy", ""),
                        caller = data.optString("caller", "")
                    )
                    Log.d(TAG, "Call answered elsewhere by ${event.answeredBy}")
                    _callAnsweredElsewhere.tryEmit(event)
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing call:answered-elsewhere", e)
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

    // WebRTC signaling emit methods
    fun sendWebRTCOffer(to: String, sdp: String) {
        socket?.emit("webrtc:offer", JSONObject().apply {
            put("to", to)
            put("offer", JSONObject().apply {
                put("type", "offer")
                put("sdp", sdp)
            })
        })
        Log.d(TAG, "Sent WebRTC offer to $to")
    }

    fun sendWebRTCAnswer(to: String, sdp: String) {
        socket?.emit("webrtc:answer", JSONObject().apply {
            put("to", to)
            put("answer", JSONObject().apply {
                put("type", "answer")
                put("sdp", sdp)
            })
        })
        Log.d(TAG, "Sent WebRTC answer to $to")
    }

    fun sendIceCandidate(to: String, candidate: String, sdpMid: String?, sdpMLineIndex: Int) {
        socket?.emit("webrtc:ice-candidate", JSONObject().apply {
            put("to", to)
            put("candidate", JSONObject().apply {
                put("candidate", candidate)
                put("sdpMid", sdpMid ?: JSONObject.NULL)
                put("sdpMLineIndex", sdpMLineIndex)
            })
        })
        Log.d(TAG, "Sent ICE candidate to $to")
    }

    fun closeWebRTC(to: String) {
        socket?.emit("webrtc:close", JSONObject().apply {
            put("to", to)
        })
        Log.d(TAG, "Sent WebRTC close to $to")
    }

    // Call signaling emit methods
    fun requestCall(to: String, withCamera: Boolean) {
        socket?.emit("call:request", JSONObject().apply {
            put("to", to)
            put("withCamera", withCamera)
        })
        Log.d(TAG, "Sent call request to $to (camera=$withCamera)")
    }

    fun acceptCall(to: String, withCamera: Boolean) {
        socket?.emit("call:accept", JSONObject().apply {
            put("to", to)
            put("withCamera", withCamera)
        })
        Log.d(TAG, "Sent call accept to $to")
    }

    fun rejectCall(to: String) {
        socket?.emit("call:reject", JSONObject().apply {
            put("to", to)
        })
        Log.d(TAG, "Sent call reject to $to")
    }

    fun endCall(to: String) {
        socket?.emit("call:end", JSONObject().apply {
            put("to", to)
        })
        Log.d(TAG, "Sent call end to $to")
    }

    fun toggleCamera(to: String, enabled: Boolean) {
        socket?.emit("call:toggle-camera", JSONObject().apply {
            put("to", to)
            put("enabled", enabled)
        })
        Log.d(TAG, "Sent call:toggle-camera to $to, enabled=$enabled")
    }
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

// WebRTC signaling events
data class WebRTCOfferEvent(
    val from: String,
    val fromUsername: String,
    val offer: String
)

data class WebRTCAnswerEvent(
    val from: String,
    val answer: String
)

data class WebRTCIceCandidateEvent(
    val from: String,
    val candidate: String,
    val sdpMid: String,
    val sdpMLineIndex: Int
)

data class WebRTCCloseEvent(
    val from: String
)

// Call signaling events
data class CallRequestEvent(
    val from: String,
    val fromUsername: String,
    val withCamera: Boolean
)

data class CallAcceptEvent(
    val from: String,
    val withCamera: Boolean
)

data class CallRejectEvent(
    val from: String
)

data class CallEndEvent(
    val from: String
)

data class CallToggleCameraEvent(
    val from: String,
    val enabled: Boolean
)

data class CallAnsweredElsewhereEvent(
    val answeredBy: String,
    val caller: String
)
