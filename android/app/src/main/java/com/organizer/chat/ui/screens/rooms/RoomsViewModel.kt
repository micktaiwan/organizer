package com.organizer.chat.ui.screens.rooms

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.organizer.chat.data.model.Room
import com.organizer.chat.data.repository.AuthRepository
import com.organizer.chat.data.repository.RoomRepository
import com.organizer.chat.util.TokenManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

data class RoomsUiState(
    val rooms: List<Room> = emptyList(),
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val currentUserId: String? = null,
    val currentUsername: String? = null,
    // Create room dialog state
    val showCreateRoomDialog: Boolean = false,
    val isCreatingRoom: Boolean = false,
    val createRoomError: String? = null,
    val createdRoom: Room? = null
)

class RoomsViewModel(
    private val roomRepository: RoomRepository,
    private val tokenManager: TokenManager,
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(RoomsUiState())
    val uiState: StateFlow<RoomsUiState> = _uiState.asStateFlow()

    init {
        loadCurrentUser()
        loadRooms()
    }

    private fun loadCurrentUser() {
        viewModelScope.launch {
            val userId = tokenManager.userId.first()
            val username = tokenManager.username.first()
            _uiState.value = _uiState.value.copy(
                currentUserId = userId,
                currentUsername = username
            )
        }
    }

    fun loadRooms() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)

            val result = roomRepository.getRooms()

            result.fold(
                onSuccess = { rooms ->
                    _uiState.value = _uiState.value.copy(
                        rooms = rooms,
                        isLoading = false
                    )
                },
                onFailure = { error ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        errorMessage = error.message ?: "Erreur lors du chargement"
                    )
                }
            )
        }
    }

    fun logout() {
        viewModelScope.launch {
            authRepository.logout()
        }
    }

    fun getRoomDisplayName(room: Room): String {
        val currentUserId = _uiState.value.currentUserId

        return when {
            // For private rooms, show the other person's name
            room.type == "private" && currentUserId != null -> {
                val otherMember = room.members.find { it.userId.id != currentUserId }
                otherMember?.userId?.displayName ?: room.name
            }
            // For lobby and public rooms, show the room name
            else -> room.name
        }
    }

    fun getRoomSubtitle(room: Room): String {
        val currentUserId = _uiState.value.currentUserId
        val isMember = currentUserId != null && room.members.any { it.userId.id == currentUserId }
        val n = room.members.size

        return when (room.type) {
            "lobby" -> "Lobby"
            "public" -> if (isMember) "$n membre${if (n > 1) "s" else ""}" else "Non abonne"
            "private" -> "Conversation privee"
            else -> ""
        }
    }

    fun leaveRoom(roomId: String) {
        viewModelScope.launch {
            val result = roomRepository.leaveRoom(roomId)
            result.fold(
                onSuccess = {
                    // Refresh rooms list
                    loadRooms()
                },
                onFailure = { error ->
                    android.util.Log.e("RoomsViewModel", "Failed to leave room: ${error.message}")
                }
            )
        }
    }

    fun canLeaveRoom(room: Room): Boolean {
        val currentUserId = _uiState.value.currentUserId ?: return false
        if (room.isLobby || room.type == "lobby") return false
        // Check if user is a member
        val isMember = room.members.any { it.userId.id == currentUserId }
        // Can leave if member but not creator
        val creatorId = (room as? Any)?.let {
            // Room doesn't have createdBy in the model, so we can't check
            // For now, allow leaving for all members
            null
        }
        return isMember
    }

    fun isMember(room: Room): Boolean {
        val currentUserId = _uiState.value.currentUserId ?: return false
        // Lobby is always considered "member"
        if (room.isLobby || room.type == "lobby") return true
        return room.members.any { it.userId.id == currentUserId }
    }

    fun showCreateRoomDialog() {
        _uiState.value = _uiState.value.copy(
            showCreateRoomDialog = true,
            createRoomError = null
        )
    }

    fun hideCreateRoomDialog() {
        _uiState.value = _uiState.value.copy(
            showCreateRoomDialog = false,
            createRoomError = null
        )
    }

    fun createRoom(name: String) {
        val trimmedName = name.trim()

        // Validation
        if (trimmedName.isEmpty()) {
            _uiState.value = _uiState.value.copy(
                createRoomError = "Le nom ne peut pas etre vide"
            )
            return
        }
        if (trimmedName.length > 100) {
            _uiState.value = _uiState.value.copy(
                createRoomError = "Le nom ne peut pas depasser 100 caracteres"
            )
            return
        }

        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(
                isCreatingRoom = true,
                createRoomError = null
            )

            val result = roomRepository.createRoom(trimmedName)

            result.fold(
                onSuccess = { room ->
                    _uiState.value = _uiState.value.copy(
                        isCreatingRoom = false,
                        showCreateRoomDialog = false,
                        createdRoom = room
                    )
                    // Refresh rooms list
                    loadRooms()
                },
                onFailure = { error ->
                    _uiState.value = _uiState.value.copy(
                        isCreatingRoom = false,
                        createRoomError = error.message ?: "Erreur lors de la creation"
                    )
                }
            )
        }
    }

    fun clearCreatedRoom() {
        _uiState.value = _uiState.value.copy(createdRoom = null)
    }
}
