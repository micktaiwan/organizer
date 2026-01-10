package com.organizer.chat.data.socket

import android.util.Log
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

    fun connect() {
        val token = tokenManager.getTokenSync()
        if (token == null) {
            Log.e(TAG, "Cannot connect: no token available")
            return
        }

        try {
            val options = IO.Options().apply {
                auth = mapOf("token" to token)
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
                    val event = NewMessageEvent(
                        from = data.getString("from"),
                        roomId = data.getString("roomId"),
                        messageId = data.getString("messageId")
                    )
                    _newMessage.tryEmit(event)
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing message:new", e)
                }
            }

            on("user:online") { args ->
                try {
                    val data = args[0] as JSONObject
                    val event = UserStatusEvent(
                        userId = data.getString("userId"),
                        status = data.optString("status", "available"),
                        statusMessage = data.optString("statusMessage", null),
                        isMuted = data.optBoolean("isMuted", false)
                    )
                    _userOnline.tryEmit(event)
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing user:online", e)
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

    fun notifyMessagesRead(roomId: String, messageIds: List<String>) {
        socket?.emit("message:read", JSONObject().apply {
            put("roomId", roomId)
            put("messageIds", org.json.JSONArray(messageIds))
        })
    }

    fun isConnected(): Boolean = socket?.connected() == true
}

// Event classes
sealed class ConnectionState {
    object Connected : ConnectionState()
    object Disconnected : ConnectionState()
    data class Error(val message: String) : ConnectionState()
}

data class NewMessageEvent(
    val from: String,
    val roomId: String,
    val messageId: String
)

data class UserStatusEvent(
    val userId: String,
    val status: String,
    val statusMessage: String?,
    val isMuted: Boolean
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
