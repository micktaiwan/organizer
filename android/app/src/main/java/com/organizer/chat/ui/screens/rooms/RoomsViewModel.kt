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
    val currentUsername: String? = null
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
        return when (room.type) {
            "lobby" -> "Lobby"
            "public" -> "${room.members.size} membres"
            "private" -> "Conversation privee"
            else -> ""
        }
    }
}
