package com.organizer.chat.ui.screens.chat

import android.content.Context
import android.net.Uri
import android.util.Log
import androidx.compose.foundation.text.input.TextFieldState
import androidx.compose.foundation.text.input.clearText
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.organizer.chat.data.model.Message
import com.organizer.chat.data.model.Reaction
import com.organizer.chat.data.repository.MessageRepository
import com.organizer.chat.data.socket.ConnectionState
import com.organizer.chat.data.socket.VideoThumbnailReadyEvent
import com.organizer.chat.data.repository.RoomRepository
import java.time.Instant
import com.organizer.chat.service.ChatService
import com.organizer.chat.util.DocumentInfo
import com.organizer.chat.util.DocumentPicker
import com.organizer.chat.util.ImageCompressor
import com.organizer.chat.util.ScreenRecorder
import com.organizer.chat.util.TokenManager
import com.organizer.chat.util.VoiceRecorder
import com.organizer.chat.service.VideoRecorderService
import android.media.projection.MediaProjection
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import androidx.compose.runtime.snapshotFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.io.File

enum class VideoRecordingState {
    IDLE,
    RECORDING,
    PREVIEW,
    UPLOADING
}

enum class CameraRecordingState {
    IDLE,
    RECORDING,
    PREVIEW,
    UPLOADING
}

data class ChatUiState(
    val messages: List<Message> = emptyList(),
    val isLoading: Boolean = false,
    val isSending: Boolean = false,
    val errorMessage: String? = null,
    val currentUserId: String? = null,
    val typingUsers: Set<String> = emptySet(),
    val isRecording: Boolean = false,
    val recordingDuration: Int = 0,
    val selectedImageUri: Uri? = null,
    val isCompressingImage: Boolean = false,
    val isUploadingImage: Boolean = false,
    val selectedFileInfo: DocumentInfo? = null,
    val isUploadingFile: Boolean = false,
    val hasMoreMessages: Boolean = true,
    val isLoadingMore: Boolean = false,
    val shouldScrollToBottom: Boolean = true,
    val humanMemberIds: List<String> = emptyList(),
    // Video recording state (screen recording)
    val videoRecordingState: VideoRecordingState = VideoRecordingState.IDLE,
    val recordedVideoFile: File? = null,
    val videoRecordingDuration: Int = 0,
    // Camera recording state (webcam)
    val cameraRecordingState: CameraRecordingState = CameraRecordingState.IDLE,
    val cameraRecordedFile: File? = null
)

class ChatViewModel(
    private val roomId: String,
    private val messageRepository: MessageRepository,
    private val roomRepository: RoomRepository,
    private val chatService: ChatService?,
    private val tokenManager: TokenManager,
    private val context: Context
) : ViewModel() {

    companion object {
        private const val TAG = "ChatViewModel"
        private const val MESSAGE_PAGE_SIZE = 20
    }

    private val _uiState = MutableStateFlow(ChatUiState())
    val uiState: StateFlow<ChatUiState> = _uiState.asStateFlow()

    // TextFieldState for synchronous text updates (prevents keyboard from closing)
    val textFieldState = TextFieldState()

    private val voiceRecorder = VoiceRecorder(context)
    private val imageCompressor = ImageCompressor(context)
    private val screenRecorder = ScreenRecorder(context)
    private var recordingTimerJob: Job? = null
    private var videoRecordingTimerJob: Job? = null
    private var compressingJob: Job? = null
    private var tempCompressedFile: File? = null

    init {
        loadCurrentUser()
        loadRoomInfo()
        loadMessages()
        observeServiceMessages()
        observeTypingState()
        observeMessageReadEvents()
        observeConnectionState()
        observeForegroundState()
        joinRoom()
    }

    private fun observeTypingState() {
        viewModelScope.launch {
            // Emit typing:start on every text change (server handles timeout/debounce)
            snapshotFlow { textFieldState.text.toString() }
                .collect { text ->
                    chatService?.socketManager?.let { socketManager ->
                        if (text.isNotEmpty()) {
                            socketManager.notifyTypingStart(roomId)
                        } else {
                            socketManager.notifyTypingStop(roomId)
                        }
                    }
                }
        }
    }

    private fun observeConnectionState() {
        chatService?.socketManager?.let { socketManager ->
            viewModelScope.launch {
                var wasConnected = socketManager.isConnected()
                socketManager.connectionState.collect { state ->
                    when (state) {
                        is ConnectionState.Connected -> {
                            if (!wasConnected) {
                                Log.d(TAG, "Socket reconnected, reloading messages and rejoining room")
                                loadMessages()
                                joinRoom()
                            }
                            wasConnected = true
                        }
                        is ConnectionState.Disconnected,
                        is ConnectionState.Error -> {
                            wasConnected = false
                        }
                    }
                }
            }
        }
    }

    /**
     * Observe foreground state to mark messages as read when app comes to foreground.
     */
    private fun observeForegroundState() {
        chatService?.let { service ->
            viewModelScope.launch {
                var wasInForeground = service.isAppInForeground.value
                service.isAppInForeground.collect { inForeground ->
                    if (inForeground && !wasInForeground) {
                        // App just came to foreground - mark unread messages as read
                        Log.d(TAG, "App came to foreground, marking unread messages as read")
                        markUnreadMessagesAsRead(_uiState.value.messages)
                    }
                    wasInForeground = inForeground
                }
            }
        }
    }

    /**
     * Adds a message to the list only if it doesn't already exist (avoids race condition with socket).
     * Returns true if the message was added, false if it already existed.
     */
    private fun addMessageIfNotExists(message: Message): Boolean {
        val alreadyExists = _uiState.value.messages.any { it.id == message.id }
        if (!alreadyExists) {
            _uiState.value = _uiState.value.copy(
                messages = _uiState.value.messages + message,
                shouldScrollToBottom = true
            )
        }
        return !alreadyExists
    }

    private fun joinRoom() {
        chatService?.socketManager?.joinRoom(roomId)
    }

    private fun loadCurrentUser() {
        viewModelScope.launch {
            val userId = tokenManager.userId.first()
            _uiState.value = _uiState.value.copy(currentUserId = userId)
        }
    }

    private fun loadRoomInfo() {
        viewModelScope.launch {
            roomRepository.getRoom(roomId).fold(
                onSuccess = { room ->
                    // Get IDs of human (non-bot) members for read status calculation
                    val humanIds = room.members
                        .filter { !it.userId.isBot }
                        .map { it.userId.id }
                    Log.d(TAG, "Room ${room.name}: ${humanIds.size} human members")
                    _uiState.value = _uiState.value.copy(humanMemberIds = humanIds)
                },
                onFailure = { error ->
                    Log.e(TAG, "Failed to load room info: ${error.message}")
                }
            )
        }
    }

    fun loadMessages() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)

            val result = messageRepository.getMessages(roomId, limit = MESSAGE_PAGE_SIZE)

            result.fold(
                onSuccess = { messages ->
                    Log.d(TAG, "Loaded ${messages.size} messages for room $roomId")
                    _uiState.value = _uiState.value.copy(
                        messages = messages,
                        isLoading = false,
                        hasMoreMessages = messages.size == MESSAGE_PAGE_SIZE,
                        shouldScrollToBottom = true
                    )
                    // Mark unread messages as read only if app is in foreground
                    if (chatService?.isAppInForeground?.value == true) {
                        markUnreadMessagesAsRead(messages)
                    }
                },
                onFailure = { error ->
                    Log.e(TAG, "Failed to load messages: ${error.message}")
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        errorMessage = error.message ?: "Erreur lors du chargement"
                    )
                }
            )
        }
    }

    private fun markUnreadMessagesAsRead(messages: List<Message>) {
        viewModelScope.launch {
            val currentUserId = _uiState.value.currentUserId ?: return@launch
            val unreadIds = messages
                .filter { it.senderId.id != currentUserId && !it.readBy.contains(currentUserId) }
                .map { it.id }

            if (unreadIds.isNotEmpty()) {
                Log.d(TAG, "Marking ${unreadIds.size} messages as read")
                // Server will broadcast socket event to other clients
                messageRepository.markMessagesAsRead(unreadIds, roomId).fold(
                    onSuccess = {
                        // Update local state with current user in readBy
                        val updatedMessages = _uiState.value.messages.map { msg ->
                            if (unreadIds.contains(msg.id)) {
                                msg.copy(readBy = msg.readBy + currentUserId)
                            } else msg
                        }
                        _uiState.value = _uiState.value.copy(messages = updatedMessages)
                    },
                    onFailure = { error ->
                        Log.e(TAG, "Failed to mark messages as read: ${error.message}")
                    }
                )
            }
        }
    }

    fun loadMoreMessages() {
        val oldestMessage = _uiState.value.messages.firstOrNull() ?: return
        if (_uiState.value.isLoadingMore || !_uiState.value.hasMoreMessages) return

        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoadingMore = true)

            val result = messageRepository.getMessages(
                roomId,
                limit = MESSAGE_PAGE_SIZE,
                before = oldestMessage.createdAt
            )

            result.fold(
                onSuccess = { olderMessages ->
                    Log.d(TAG, "Loaded ${olderMessages.size} older messages for room $roomId")
                    _uiState.value = _uiState.value.copy(
                        messages = olderMessages + _uiState.value.messages,
                        isLoadingMore = false,
                        hasMoreMessages = olderMessages.size == MESSAGE_PAGE_SIZE,
                        shouldScrollToBottom = false
                    )
                },
                onFailure = { error ->
                    Log.e(TAG, "Failed to load more messages: ${error.message}")
                    _uiState.value = _uiState.value.copy(
                        isLoadingMore = false,
                        errorMessage = error.message ?: "Erreur lors du chargement"
                    )
                }
            )
        }
    }

    private fun observeServiceMessages() {
        chatService?.let { service ->
            viewModelScope.launch {
                service.messages.collect { event ->
                    Log.d(TAG, "Received message event: roomId=${event.roomId}, current=$roomId")
                    if (event.roomId == roomId) {
                        // Fetch full message from API (uniformized pattern with Desktop)
                        messageRepository.getMessage(event.messageId).fold(
                            onSuccess = { message ->
                                if (addMessageIfNotExists(message)) {
                                    Log.d(TAG, "Added new message from API: ${event.messageId}")
                                    // Mark as read only if app is in foreground (user is actually viewing)
                                    if (message.senderId.id != _uiState.value.currentUserId &&
                                        service.isAppInForeground.value) {
                                        markUnreadMessagesAsRead(listOf(message))
                                    }
                                }
                            },
                            onFailure = { error ->
                                Log.e(TAG, "Failed to fetch message ${event.messageId}: ${error.message}")
                            }
                        )
                    }
                }
            }

            viewModelScope.launch {
                service.socketManager.typingStart.collect { event ->
                    // Don't filter out currentUserId - useful for testing with same account across platforms
                    if (event.roomId == roomId) {
                        _uiState.value = _uiState.value.copy(
                            typingUsers = _uiState.value.typingUsers + event.from
                        )
                    }
                }
            }

            viewModelScope.launch {
                service.socketManager.typingStop.collect { event ->
                    if (event.roomId == roomId) {
                        _uiState.value = _uiState.value.copy(
                            typingUsers = _uiState.value.typingUsers - event.from
                        )
                    }
                }
            }

            viewModelScope.launch {
                service.socketManager.messageDeleted.collect { event ->
                    if (event.roomId == roomId) {
                        Log.d(TAG, "Message deleted in current room: ${event.messageId}")
                        _uiState.value = _uiState.value.copy(
                            messages = _uiState.value.messages.filter { it.id != event.messageId }
                        )
                    }
                }
            }

            viewModelScope.launch {
                service.socketManager.messageReacted.collect { event ->
                    if (event.roomId == roomId) {
                        Log.d(TAG, "Message reacted in current room: ${event.messageId} with ${event.emoji} (${event.action})")
                        // Update the message locally instead of reloading all messages
                        val updatedMessages = _uiState.value.messages.map { msg ->
                            if (msg.id == event.messageId) {
                                val updatedReactions = if (event.action == "added") {
                                    // Add reaction if not already present from this user
                                    if (msg.reactions.none { it.userId == event.from && it.emoji == event.emoji }) {
                                        msg.reactions + Reaction(
                                            userId = event.from,
                                            emoji = event.emoji,
                                            createdAt = Instant.now().toString()
                                        )
                                    } else msg.reactions
                                } else {
                                    // Remove reaction
                                    msg.reactions.filter { !(it.userId == event.from && it.emoji == event.emoji) }
                                }
                                msg.copy(reactions = updatedReactions)
                            } else msg
                        }
                        _uiState.value = _uiState.value.copy(messages = updatedMessages)
                    }
                }
            }

            // Observe user status changes to update message senders
            viewModelScope.launch {
                service.socketManager.userStatusChanged.collect { event ->
                    Log.d(TAG, "User status changed: ${event.userId} -> ${event.status} / ${event.statusMessage}")
                    val updatedMessages = _uiState.value.messages.map { msg ->
                        if (msg.senderId.id == event.userId) {
                            msg.copy(
                                senderId = msg.senderId.copy(
                                    status = event.status,
                                    statusMessage = event.statusMessage
                                )
                            )
                        } else msg
                    }
                    _uiState.value = _uiState.value.copy(messages = updatedMessages)
                }
            }

            // Observe user online/offline to update message sender dots
            viewModelScope.launch {
                service.socketManager.userOnline.collect { event ->
                    val updatedMessages = _uiState.value.messages.map { msg ->
                        if (msg.senderId.id == event.userId) {
                            msg.copy(senderId = msg.senderId.copy(isOnline = true))
                        } else msg
                    }
                    _uiState.value = _uiState.value.copy(messages = updatedMessages)
                }
            }

            viewModelScope.launch {
                service.socketManager.userOffline.collect { event ->
                    val updatedMessages = _uiState.value.messages.map { msg ->
                        if (msg.senderId.id == event.userId) {
                            msg.copy(senderId = msg.senderId.copy(isOnline = false))
                        } else msg
                    }
                    _uiState.value = _uiState.value.copy(messages = updatedMessages)
                }
            }

            // Video thumbnail ready - update message when server finishes generating thumbnail
            viewModelScope.launch {
                service.socketManager.videoThumbnailReady.collect { event ->
                    updateMessageThumbnail(event)
                }
            }
        }
    }

    private fun updateMessageThumbnail(event: VideoThumbnailReadyEvent) {
        Log.d(TAG, "Updating thumbnail for message ${event.messageId}: ${event.thumbnailUrl}")
        _uiState.value = _uiState.value.copy(
            messages = _uiState.value.messages.map { msg ->
                if (msg.id == event.messageId) {
                    msg.copy(
                        thumbnailUrl = event.thumbnailUrl,
                        duration = event.duration,
                        width = event.width,
                        height = event.height
                    )
                } else msg
            }
        )
    }

    private fun observeMessageReadEvents() {
        chatService?.let { service ->
            viewModelScope.launch {
                service.socketManager.messageRead.collect { event ->
                    val currentUserId = _uiState.value.currentUserId
                    // Skip self-broadcasts (local state already updated in markUnreadMessagesAsRead)
                    if (event.roomId == roomId && event.from != currentUserId) {
                        Log.d(TAG, "Messages read by ${event.from}: ${event.messageIds}")
                        // Update readBy for affected messages
                        val updatedMessages = _uiState.value.messages.map { msg ->
                            if (event.messageIds.contains(msg.id) && !msg.readBy.contains(event.from)) {
                                msg.copy(readBy = msg.readBy + event.from)
                            } else msg
                        }
                        _uiState.value = _uiState.value.copy(messages = updatedMessages)
                    }
                }
            }
        }
    }

    fun sendMessage() {
        val content = textFieldState.text.toString().trim()
        val fileInfo = _uiState.value.selectedFileInfo
        val imageUri = _uiState.value.selectedImageUri

        // If file is selected, send file with optional caption
        if (fileInfo != null) {
            textFieldState.clearText()
            sendFileWithCaption(fileInfo, content)
            return
        }

        // If image is selected, send image with optional caption
        if (imageUri != null) {
            textFieldState.clearText()
            sendImageWithCaption(imageUri, content)
            return
        }

        // Otherwise, send text-only message
        if (content.isEmpty()) return

        // Clear text immediately - TextFieldState handles this synchronously
        textFieldState.clearText()

        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isSending = true)
            chatService?.socketManager?.notifyTypingStop(roomId)

            val result = messageRepository.sendMessage(roomId, content)

            result.fold(
                onSuccess = { message ->
                    Log.d(TAG, "Message sent successfully: ${message.id}")
                    addMessageIfNotExists(message)
                    _uiState.value = _uiState.value.copy(isSending = false)
                },
                onFailure = { error ->
                    Log.e(TAG, "Failed to send message: ${error.message}")
                    _uiState.value = _uiState.value.copy(
                        isSending = false,
                        errorMessage = error.message ?: "Erreur lors de l'envoi"
                    )
                }
            )
        }
    }

    fun isMyMessage(message: Message): Boolean {
        return message.senderId.id == _uiState.value.currentUserId
    }

    fun reactToMessage(messageId: String, emoji: String) {
        viewModelScope.launch {
            val result = messageRepository.reactToMessage(messageId, emoji)

            result.fold(
                onSuccess = { response ->
                    Log.d(TAG, "Reaction ${response.action}: $emoji on message $messageId")
                    // Update local message with new reactions
                    val updatedMessages = _uiState.value.messages.map { msg ->
                        if (msg.id == messageId) response.message else msg
                    }
                    _uiState.value = _uiState.value.copy(messages = updatedMessages)
                    // Notify other users via socket
                    chatService?.socketManager?.notifyReaction(
                        response.roomId,
                        messageId,
                        emoji,
                        response.action
                    )
                },
                onFailure = { error ->
                    Log.e(TAG, "Failed to react to message: ${error.message}")
                    _uiState.value = _uiState.value.copy(
                        errorMessage = error.message ?: "Erreur lors de la reaction"
                    )
                }
            )
        }
    }

    fun deleteMessage(messageId: String) {
        viewModelScope.launch {
            val result = messageRepository.deleteMessage(messageId)

            result.fold(
                onSuccess = {
                    Log.d(TAG, "Message deleted: $messageId")
                    // Remove from local state
                    _uiState.value = _uiState.value.copy(
                        messages = _uiState.value.messages.filter { it.id != messageId }
                    )
                    // Notify other users via socket
                    chatService?.socketManager?.notifyMessageDelete(roomId, messageId)
                },
                onFailure = { error ->
                    Log.e(TAG, "Failed to delete message: ${error.message}")
                    _uiState.value = _uiState.value.copy(
                        errorMessage = error.message ?: "Erreur lors de la suppression"
                    )
                }
            )
        }
    }

    fun startRecording(): Boolean {
        if (_uiState.value.isRecording) return false

        val started = voiceRecorder.startRecording()
        if (started) {
            _uiState.value = _uiState.value.copy(
                isRecording = true,
                recordingDuration = 0
            )
            startRecordingTimer()
            Log.d(TAG, "Voice recording started")
        }
        return started
    }

    private fun startRecordingTimer() {
        recordingTimerJob?.cancel()
        recordingTimerJob = viewModelScope.launch {
            while (_uiState.value.isRecording) {
                delay(1000)
                if (_uiState.value.isRecording) {
                    _uiState.value = _uiState.value.copy(
                        recordingDuration = _uiState.value.recordingDuration + 1
                    )
                }
            }
        }
    }

    fun stopRecordingAndSend() {
        if (!_uiState.value.isRecording) return

        recordingTimerJob?.cancel()
        val base64Audio = voiceRecorder.stopRecording()

        _uiState.value = _uiState.value.copy(
            isRecording = false,
            recordingDuration = 0
        )

        if (base64Audio != null) {
            sendAudioMessage(base64Audio)
        } else {
            Log.e(TAG, "Failed to get audio data")
        }
    }

    private fun sendAudioMessage(base64Audio: String) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isSending = true)

            val result = messageRepository.sendMessage(roomId, base64Audio, type = "audio")

            result.fold(
                onSuccess = { message ->
                    Log.d(TAG, "Audio message sent successfully: ${message.id}")
                    addMessageIfNotExists(message)
                    _uiState.value = _uiState.value.copy(isSending = false)
                },
                onFailure = { error ->
                    Log.e(TAG, "Failed to send audio message: ${error.message}")
                    _uiState.value = _uiState.value.copy(
                        isSending = false,
                        errorMessage = error.message ?: "Erreur lors de l'envoi"
                    )
                }
            )
        }
    }

    fun selectImage(uri: Uri) {
        _uiState.value = _uiState.value.copy(selectedImageUri = uri)
        // Don't send immediately - wait for user to press Send
    }

    fun clearSelectedImage() {
        tempCompressedFile?.let { imageCompressor.cleanup(it) }
        tempCompressedFile = null
        _uiState.value = _uiState.value.copy(
            selectedImageUri = null,
            isCompressingImage = false,
            isUploadingImage = false
        )
    }

    // File selection
    fun selectFile(documentInfo: DocumentInfo) {
        // Clear any selected image first
        clearSelectedImage()
        _uiState.value = _uiState.value.copy(selectedFileInfo = documentInfo)
    }

    fun clearSelectedFile() {
        _uiState.value = _uiState.value.copy(
            selectedFileInfo = null,
            isUploadingFile = false
        )
    }

    private fun sendFileWithCaption(documentInfo: DocumentInfo, caption: String) {
        viewModelScope.launch {
            try {
                _uiState.value = _uiState.value.copy(isUploadingFile = true)
                chatService?.socketManager?.notifyTypingStop(roomId)
                Log.d(TAG, "Uploading file: ${documentInfo.fileName}")

                // Copy to temp file
                val tempFile = DocumentPicker.copyToTempFile(context, documentInfo)
                if (tempFile == null) {
                    Log.e(TAG, "Failed to copy file to temp")
                    _uiState.value = _uiState.value.copy(
                        isUploadingFile = false,
                        errorMessage = "Erreur lors de la preparation du fichier"
                    )
                    clearSelectedFile()
                    return@launch
                }

                // Upload file
                val result = messageRepository.uploadAndSendFile(
                    roomId,
                    tempFile,
                    documentInfo.mimeType,
                    caption.ifEmpty { null }
                )

                // Cleanup temp file
                tempFile.delete()

                result.fold(
                    onSuccess = { message ->
                        Log.d(TAG, "File uploaded successfully: ${message.id}")
                        addMessageIfNotExists(message)
                        _uiState.value = _uiState.value.copy(isUploadingFile = false)
                        clearSelectedFile()
                    },
                    onFailure = { error ->
                        Log.e(TAG, "Failed to upload file: ${error.message}")
                        _uiState.value = _uiState.value.copy(
                            isUploadingFile = false,
                            errorMessage = error.message ?: "Erreur lors de l'envoi"
                        )
                        clearSelectedFile()
                    }
                )
            } catch (e: Exception) {
                Log.e(TAG, "Error sending file: ${e.message}")
                _uiState.value = _uiState.value.copy(
                    isUploadingFile = false,
                    errorMessage = e.message ?: "Erreur"
                )
                clearSelectedFile()
            }
        }
    }

    private fun sendImageWithCaption(imageUri: Uri, caption: String) {
        compressingJob?.cancel()
        compressingJob = viewModelScope.launch {
            try {
                _uiState.value = _uiState.value.copy(
                    isCompressingImage = true
                )
                chatService?.socketManager?.notifyTypingStop(roomId)
                Log.d(TAG, "Compressing image...")

                // Compress image
                val compressedFile = imageCompressor.compressImage(imageUri)
                if (compressedFile == null) {
                    Log.e(TAG, "Failed to compress image")
                    _uiState.value = _uiState.value.copy(
                        isCompressingImage = false,
                        errorMessage = "Erreur lors de la compression"
                    )
                    clearSelectedImage()
                    return@launch
                }

                tempCompressedFile = compressedFile
                Log.d(TAG, "Image compressed: ${compressedFile.length()} bytes")

                _uiState.value = _uiState.value.copy(
                    isCompressingImage = false,
                    isUploadingImage = true
                )

                // Upload image with optional caption
                val result = messageRepository.uploadAndSendImage(
                    roomId,
                    compressedFile,
                    caption.ifEmpty { null }
                )

                result.fold(
                    onSuccess = { message ->
                        Log.d(TAG, "Image uploaded successfully: ${message.id}")
                        addMessageIfNotExists(message)
                        _uiState.value = _uiState.value.copy(isUploadingImage = false)
                        clearSelectedImage()
                    },
                    onFailure = { error ->
                        Log.e(TAG, "Failed to upload image: ${error.message}")
                        _uiState.value = _uiState.value.copy(
                            isUploadingImage = false,
                            errorMessage = error.message ?: "Erreur lors de l'envoi"
                        )
                        clearSelectedImage()
                    }
                )
            } catch (e: Exception) {
                Log.e(TAG, "Error sending image: ${e.message}")
                _uiState.value = _uiState.value.copy(
                    isCompressingImage = false,
                    isUploadingImage = false,
                    errorMessage = e.message ?: "Erreur"
                )
                clearSelectedImage()
            }
        }
    }

    // Video recording functions

    /**
     * Called when the user taps the video record button.
     * The activity should handle the result and call onScreenCaptureResult.
     */
    fun onScreenCaptureGranted(resultCode: Int, data: android.content.Intent) {
        Log.d(TAG, "Screen capture permission granted")

        // Set up callbacks before starting service
        VideoRecorderService.setCallbacks(
            onReady = { projection ->
                Log.d(TAG, "MediaProjection ready, starting recording")
                startVideoRecordingWithProjection(projection)
            },
            onStopped = {
                Log.d(TAG, "MediaProjection stopped by system")
                // If we were recording, try to save what we have
                if (_uiState.value.videoRecordingState == VideoRecordingState.RECORDING) {
                    videoRecordingTimerJob?.cancel()
                    val file = screenRecorder.stopRecording()
                    if (file != null && file.exists() && file.length() > 0) {
                        _uiState.value = _uiState.value.copy(
                            videoRecordingState = VideoRecordingState.PREVIEW,
                            recordedVideoFile = file
                        )
                    } else {
                        _uiState.value = _uiState.value.copy(
                            videoRecordingState = VideoRecordingState.IDLE,
                            videoRecordingDuration = 0
                        )
                    }
                }
            }
        )

        // Start the foreground service
        VideoRecorderService.start(context, resultCode, data)
    }

    private fun startVideoRecordingWithProjection(projection: MediaProjection) {
        val started = screenRecorder.startRecording(projection)
        if (started) {
            _uiState.value = _uiState.value.copy(
                videoRecordingState = VideoRecordingState.RECORDING,
                videoRecordingDuration = 0
            )
            startVideoRecordingTimer()
            Log.d(TAG, "Video recording started")
        } else {
            Log.e(TAG, "Failed to start video recording")
            VideoRecorderService.stop(context)
            _uiState.value = _uiState.value.copy(
                errorMessage = "Échec du démarrage de l'enregistrement"
            )
        }
    }

    private fun startVideoRecordingTimer() {
        videoRecordingTimerJob?.cancel()
        videoRecordingTimerJob = viewModelScope.launch {
            while (_uiState.value.videoRecordingState == VideoRecordingState.RECORDING) {
                delay(1000)
                if (_uiState.value.videoRecordingState == VideoRecordingState.RECORDING) {
                    _uiState.value = _uiState.value.copy(
                        videoRecordingDuration = _uiState.value.videoRecordingDuration + 1
                    )
                }
            }
        }
    }

    fun stopVideoRecording() {
        if (_uiState.value.videoRecordingState != VideoRecordingState.RECORDING) return

        Log.d(TAG, "Stopping video recording")
        videoRecordingTimerJob?.cancel()

        val file = screenRecorder.stopRecording()
        VideoRecorderService.stop(context)

        if (file != null && file.exists() && file.length() > 0) {
            Log.d(TAG, "Video recorded: ${file.absolutePath}, size: ${file.length()}")
            _uiState.value = _uiState.value.copy(
                videoRecordingState = VideoRecordingState.PREVIEW,
                recordedVideoFile = file
            )
        } else {
            Log.e(TAG, "Failed to get video file")
            _uiState.value = _uiState.value.copy(
                videoRecordingState = VideoRecordingState.IDLE,
                videoRecordingDuration = 0,
                errorMessage = "Échec de l'enregistrement"
            )
        }
    }

    fun sendRecordedVideo() {
        val videoFile = _uiState.value.recordedVideoFile ?: return

        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(
                videoRecordingState = VideoRecordingState.UPLOADING
            )

            val result = messageRepository.uploadAndSendVideo(roomId, videoFile)

            result.fold(
                onSuccess = { message ->
                    Log.d(TAG, "Video uploaded successfully: ${message.id}")
                    addMessageIfNotExists(message)
                    // Cleanup
                    videoFile.delete()
                    _uiState.value = _uiState.value.copy(
                        videoRecordingState = VideoRecordingState.IDLE,
                        recordedVideoFile = null,
                        videoRecordingDuration = 0
                    )
                },
                onFailure = { error ->
                    Log.e(TAG, "Failed to upload video: ${error.message}")
                    _uiState.value = _uiState.value.copy(
                        videoRecordingState = VideoRecordingState.PREVIEW,
                        errorMessage = error.message ?: "Erreur lors de l'envoi"
                    )
                }
            )
        }
    }

    fun discardRecordedVideo() {
        val videoFile = _uiState.value.recordedVideoFile
        videoFile?.delete()
        screenRecorder.deleteRecordingFile()

        _uiState.value = _uiState.value.copy(
            videoRecordingState = VideoRecordingState.IDLE,
            recordedVideoFile = null,
            videoRecordingDuration = 0
        )
    }

    fun retryVideoRecording() {
        discardRecordedVideo()
        // The activity needs to request screen capture again
        // This will be handled by the UI layer
    }

    // Camera recording functions (webcam)

    /**
     * Open the camera recording screen.
     */
    fun startCameraRecording() {
        _uiState.value = _uiState.value.copy(
            cameraRecordingState = CameraRecordingState.RECORDING
        )
    }

    /**
     * Called when camera recording is complete.
     */
    fun onCameraRecordingComplete(file: File) {
        Log.d(TAG, "Camera recording complete: ${file.absolutePath}, size: ${file.length()}")
        _uiState.value = _uiState.value.copy(
            cameraRecordingState = CameraRecordingState.PREVIEW,
            cameraRecordedFile = file
        )
    }

    /**
     * Called when camera recording screen is dismissed without recording.
     */
    fun onCameraRecordingDismissed() {
        _uiState.value = _uiState.value.copy(
            cameraRecordingState = CameraRecordingState.IDLE
        )
    }

    /**
     * Send the recorded camera video.
     */
    fun sendCameraRecordedVideo() {
        val videoFile = _uiState.value.cameraRecordedFile ?: return

        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(
                cameraRecordingState = CameraRecordingState.UPLOADING
            )

            val result = messageRepository.uploadAndSendVideo(roomId, videoFile)

            result.fold(
                onSuccess = { message ->
                    Log.d(TAG, "Camera video uploaded successfully: ${message.id}")
                    addMessageIfNotExists(message)
                    // Cleanup
                    videoFile.delete()
                    _uiState.value = _uiState.value.copy(
                        cameraRecordingState = CameraRecordingState.IDLE,
                        cameraRecordedFile = null
                    )
                },
                onFailure = { error ->
                    Log.e(TAG, "Failed to upload camera video: ${error.message}")
                    _uiState.value = _uiState.value.copy(
                        cameraRecordingState = CameraRecordingState.PREVIEW,
                        errorMessage = error.message ?: "Erreur lors de l'envoi"
                    )
                }
            )
        }
    }

    /**
     * Discard the recorded camera video.
     */
    fun discardCameraRecordedVideo() {
        val videoFile = _uiState.value.cameraRecordedFile
        videoFile?.delete()

        _uiState.value = _uiState.value.copy(
            cameraRecordingState = CameraRecordingState.IDLE,
            cameraRecordedFile = null
        )
    }

    /**
     * Retry camera recording - discard current and open camera again.
     */
    fun retryCameraRecording() {
        discardCameraRecordedVideo()
        startCameraRecording()
    }

    override fun onCleared() {
        super.onCleared()
        recordingTimerJob?.cancel()
        videoRecordingTimerJob?.cancel()
        compressingJob?.cancel()
        voiceRecorder.release()
        screenRecorder.release()
        tempCompressedFile?.let { imageCompressor.cleanup(it) }
        // Clean up video recording service if running
        if (_uiState.value.videoRecordingState != VideoRecordingState.IDLE) {
            VideoRecorderService.stop(context)
        }
        // Clean up camera recorded file if any
        _uiState.value.cameraRecordedFile?.delete()
        chatService?.socketManager?.notifyTypingStop(roomId)
        chatService?.socketManager?.leaveRoom(roomId)
    }
}
