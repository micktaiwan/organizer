package com.organizer.chat.ui.screens.chat

import android.content.Context
import android.net.Uri
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.organizer.chat.data.model.Message
import com.organizer.chat.data.repository.MessageRepository
import com.organizer.chat.service.ChatService
import com.organizer.chat.util.ImageCompressor
import com.organizer.chat.util.TokenManager
import com.organizer.chat.util.VoiceRecorder
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.io.File

data class ChatUiState(
    val messages: List<Message> = emptyList(),
    val isLoading: Boolean = false,
    val isSending: Boolean = false,
    val errorMessage: String? = null,
    val currentUserId: String? = null,
    val messageInput: String = "",
    val typingUsers: Set<String> = emptySet(),
    val isRecording: Boolean = false,
    val recordingDuration: Int = 0,
    val selectedImageUri: Uri? = null,
    val isCompressingImage: Boolean = false,
    val isUploadingImage: Boolean = false
)

class ChatViewModel(
    private val roomId: String,
    private val messageRepository: MessageRepository,
    private val chatService: ChatService?,
    private val tokenManager: TokenManager,
    context: Context
) : ViewModel() {

    companion object {
        private const val TAG = "ChatViewModel"
    }

    private val _uiState = MutableStateFlow(ChatUiState())
    val uiState: StateFlow<ChatUiState> = _uiState.asStateFlow()

    private val voiceRecorder = VoiceRecorder(context)
    private val imageCompressor = ImageCompressor(context)
    private var recordingTimerJob: Job? = null
    private var compressingJob: Job? = null
    private var tempCompressedFile: File? = null

    init {
        loadCurrentUser()
        loadMessages()
        observeServiceMessages()
        joinRoom()
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

    fun loadMessages() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)

            val result = messageRepository.getMessages(roomId)

            result.fold(
                onSuccess = { messages ->
                    Log.d(TAG, "Loaded ${messages.size} messages for room $roomId")
                    _uiState.value = _uiState.value.copy(
                        messages = messages,
                        isLoading = false
                    )
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

    private fun observeServiceMessages() {
        chatService?.let { service ->
            viewModelScope.launch {
                service.messages.collect { event ->
                    Log.d(TAG, "Received message event: roomId=${event.roomId}, current=$roomId")
                    if (event.roomId == roomId) {
                        loadMessages()
                    }
                }
            }

            viewModelScope.launch {
                service.socketManager.typingStart.collect { event ->
                    if (event.roomId == roomId && event.from != _uiState.value.currentUserId) {
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
                        Log.d(TAG, "Message reacted in current room: ${event.messageId} with ${event.emoji}")
                        // Reload messages to get updated reactions
                        loadMessages()
                    }
                }
            }
        }
    }

    fun updateMessageInput(text: String) {
        val wasEmpty = _uiState.value.messageInput.isEmpty()
        val isEmpty = text.isEmpty()

        _uiState.value = _uiState.value.copy(messageInput = text)

        chatService?.socketManager?.let { socketManager ->
            if (wasEmpty && !isEmpty) {
                socketManager.notifyTypingStart(roomId)
            } else if (!wasEmpty && isEmpty) {
                socketManager.notifyTypingStop(roomId)
            }
        }
    }

    fun sendMessage() {
        val content = _uiState.value.messageInput.trim()
        if (content.isEmpty()) return

        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isSending = true, messageInput = "")
            chatService?.socketManager?.notifyTypingStop(roomId)

            val result = messageRepository.sendMessage(roomId, content)

            result.fold(
                onSuccess = { message ->
                    Log.d(TAG, "Message sent successfully: ${message.id}")
                    _uiState.value = _uiState.value.copy(
                        messages = _uiState.value.messages + message,
                        isSending = false
                    )
                    chatService?.socketManager?.notifyNewMessage(roomId, message.id)
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
                    _uiState.value = _uiState.value.copy(
                        messages = _uiState.value.messages + message,
                        isSending = false
                    )
                    chatService?.socketManager?.notifyNewMessage(roomId, message.id)
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
        sendImageMessage(uri)
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

    private fun sendImageMessage(imageUri: Uri) {
        compressingJob?.cancel()
        compressingJob = viewModelScope.launch {
            try {
                _uiState.value = _uiState.value.copy(isCompressingImage = true)
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

                // Upload image
                val result = messageRepository.uploadAndSendImage(roomId, compressedFile)

                result.fold(
                    onSuccess = { message ->
                        Log.d(TAG, "Image uploaded successfully: ${message.id}")
                        _uiState.value = _uiState.value.copy(
                            messages = _uiState.value.messages + message,
                            isUploadingImage = false
                        )
                        chatService?.socketManager?.notifyNewMessage(roomId, message.id)
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

    override fun onCleared() {
        super.onCleared()
        recordingTimerJob?.cancel()
        compressingJob?.cancel()
        voiceRecorder.release()
        tempCompressedFile?.let { imageCompressor.cleanup(it) }
        chatService?.socketManager?.notifyTypingStop(roomId)
        chatService?.socketManager?.leaveRoom(roomId)
    }
}
