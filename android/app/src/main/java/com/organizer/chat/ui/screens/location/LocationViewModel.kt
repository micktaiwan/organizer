package com.organizer.chat.ui.screens.location

import android.content.Context
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.organizer.chat.data.api.ApiClient
import com.organizer.chat.data.api.UpdateStatusRequest
import com.organizer.chat.data.model.UserWithLocation
import com.organizer.chat.data.repository.LocationRepository
import com.organizer.chat.data.socket.SocketManager
import com.organizer.chat.util.TokenManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class LocationUiState(
    val users: List<UserWithLocation> = emptyList(),
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val isRefreshing: Boolean = false,
    val isUpdatingMyLocation: Boolean = false,
    val myStatus: String = "available",
    val myStatusMessage: String? = null,
    val myStatusExpiresAt: String? = null,
    val isUpdatingStatus: Boolean = false
)

class LocationViewModel(
    context: Context,
    private val socketManager: SocketManager?
) : ViewModel() {

    private val locationRepository = LocationRepository(context)
    private val tokenManager = TokenManager(context)
    private val currentUserId: String? = tokenManager.getUserIdSync()

    private val _uiState = MutableStateFlow(LocationUiState())
    val uiState: StateFlow<LocationUiState> = _uiState.asStateFlow()

    init {
        loadLocations()
        observeSocketEvents()
        socketManager?.subscribeToLocations()
    }

    private fun observeSocketEvents() {
        socketManager?.let { manager ->
            // Observe location updates
            viewModelScope.launch {
                manager.userLocationUpdated.collect { event ->
                    // Update the specific user in the list or reload all
                    val currentUsers = _uiState.value.users.toMutableList()
                    val existingIndex = currentUsers.indexOfFirst { it.id == event.userId }

                    if (existingIndex >= 0 && event.location != null) {
                        // Update existing user
                        currentUsers[existingIndex] = currentUsers[existingIndex].copy(
                            isOnline = event.isOnline,
                            location = com.organizer.chat.data.model.UserLocation(
                                lat = event.location.lat,
                                lng = event.location.lng,
                                street = event.location.street,
                                city = event.location.city,
                                country = event.location.country,
                                updatedAt = event.location.updatedAt
                            )
                        )
                        _uiState.value = _uiState.value.copy(users = currentUsers)
                    } else {
                        // New user or need full reload
                        loadLocations()
                    }
                }
            }

            // Observe status changes
            viewModelScope.launch {
                manager.userStatusChanged.collect { event ->
                    Log.d("LocationViewModel", "Status changed for ${event.userId}: ${event.status} - ${event.statusMessage}")
                    val currentUsers = _uiState.value.users.toMutableList()
                    val existingIndex = currentUsers.indexOfFirst { it.id == event.userId }

                    if (existingIndex >= 0) {
                        currentUsers[existingIndex] = currentUsers[existingIndex].copy(
                            status = event.status,
                            statusMessage = event.statusMessage,
                            statusExpiresAt = event.statusExpiresAt
                        )
                        _uiState.value = _uiState.value.copy(users = currentUsers)
                    }
                }
            }
        }
    }

    fun loadLocations() {
        viewModelScope.launch {
            // Only show loading spinner on initial load (when list is empty)
            val showLoading = _uiState.value.users.isEmpty()
            if (showLoading) {
                _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            }
            val result = locationRepository.getUsersWithLocations()
            result.fold(
                onSuccess = { users ->
                    // Find current user's status
                    val currentUser = currentUserId?.let { id ->
                        users.find { it.id == id }
                    }
                    _uiState.value = _uiState.value.copy(
                        users = users,
                        isLoading = false,
                        myStatus = currentUser?.status ?: _uiState.value.myStatus,
                        myStatusMessage = currentUser?.statusMessage ?: _uiState.value.myStatusMessage,
                        myStatusExpiresAt = currentUser?.statusExpiresAt ?: _uiState.value.myStatusExpiresAt
                    )
                },
                onFailure = { error ->
                    _uiState.value = _uiState.value.copy(
                        errorMessage = error.message ?: "Erreur lors du chargement",
                        isLoading = false
                    )
                }
            )
        }
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isRefreshing = true)
            val result = locationRepository.getUsersWithLocations()
            result.fold(
                onSuccess = { users ->
                    _uiState.value = _uiState.value.copy(
                        users = users,
                        isRefreshing = false
                    )
                },
                onFailure = { error ->
                    _uiState.value = _uiState.value.copy(
                        errorMessage = error.message,
                        isRefreshing = false
                    )
                }
            )
        }
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(errorMessage = null)
    }

    /**
     * Met à jour immédiatement la position de l'utilisateur courant
     * Appelé au chargement du screen si la permission est accordée
     */
    fun updateMyLocation() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isUpdatingMyLocation = true)

            try {
                // 1. Obtenir la position GPS
                val locationResult = locationRepository.getCurrentLocation()
                if (locationResult.isFailure) {
                    Log.e("LocationViewModel", "Failed to get location: ${locationResult.exceptionOrNull()?.message}")
                    _uiState.value = _uiState.value.copy(isUpdatingMyLocation = false)
                    return@launch
                }

                val location = locationResult.getOrThrow()
                Log.d("LocationViewModel", "Got location: ${location.latitude}, ${location.longitude}")

                // 2. Reverse geocode
                val address = locationRepository.reverseGeocode(location.latitude, location.longitude)
                Log.d("LocationViewModel", "Geocoded: ${address?.street}, ${address?.city}")

                // 3. Envoyer au serveur
                val updateResult = locationRepository.updateLocation(
                    lat = location.latitude,
                    lng = location.longitude,
                    street = address?.street,
                    city = address?.city,
                    country = address?.country
                )

                if (updateResult.isSuccess) {
                    Log.d("LocationViewModel", "Location updated on server")
                    // Recharger la liste pour voir notre position
                    loadLocations()
                } else {
                    Log.e("LocationViewModel", "Failed to update location: ${updateResult.exceptionOrNull()?.message}")
                }
            } catch (e: Exception) {
                Log.e("LocationViewModel", "Error updating location", e)
            } finally {
                _uiState.value = _uiState.value.copy(isUpdatingMyLocation = false)
            }
        }
    }

    /**
     * Met à jour le statut de l'utilisateur courant
     */
    fun updateStatus(status: String, message: String?, expiresAt: String?) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isUpdatingStatus = true)

            try {
                val response = ApiClient.getService().updateStatus(
                    UpdateStatusRequest(
                        status = status,
                        statusMessage = message,
                        expiresAt = expiresAt
                    )
                )

                if (response.success) {
                    val user = response.user
                    _uiState.value = _uiState.value.copy(
                        myStatus = user?.status ?: status,
                        myStatusMessage = user?.statusMessage ?: message,
                        isUpdatingStatus = false
                    )
                    Log.d("LocationViewModel", "Status updated: $status - $message")
                    // Reload to see our own status update
                    loadLocations()
                } else {
                    Log.e("LocationViewModel", "Failed to update status")
                    _uiState.value = _uiState.value.copy(isUpdatingStatus = false)
                }
            } catch (e: Exception) {
                Log.e("LocationViewModel", "Error updating status", e)
                _uiState.value = _uiState.value.copy(isUpdatingStatus = false)
            }
        }
    }

    /**
     * Efface le statut de l'utilisateur (reset to available, no message)
     */
    fun clearStatus() {
        updateStatus("available", null, null)
    }

    override fun onCleared() {
        socketManager?.unsubscribeFromLocations()
        super.onCleared()
    }
}
