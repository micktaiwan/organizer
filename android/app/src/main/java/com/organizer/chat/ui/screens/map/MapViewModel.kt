package com.organizer.chat.ui.screens.map

import android.content.Context
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.organizer.chat.data.model.Track
import com.organizer.chat.data.model.TrackPoint
import com.organizer.chat.data.model.TrackSummary
import com.organizer.chat.data.model.TrackWithUserInfo
import com.organizer.chat.data.model.UserWithLocation
import com.organizer.chat.data.repository.LocationRepository
import com.organizer.chat.data.socket.SocketManager
import com.organizer.chat.data.socket.TrackPointData
import com.organizer.chat.service.TrackingService
import com.organizer.chat.util.TokenManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class MapUiState(
    val users: List<UserWithLocation> = emptyList(),
    val tracks: Map<String, List<TrackPoint>> = emptyMap(), // userId -> points
    val trackingUsers: Set<String> = emptySet(), // userIds currently tracking
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val isMyTrackingActive: Boolean = false,
    val myTrackingExpiresAt: Long? = null,
    val showTrackingDialog: Boolean = false,
    // Track history
    val showHistoryDialog: Boolean = false,
    val trackHistory: List<TrackSummary> = emptyList(),
    val isLoadingHistory: Boolean = false,
    // Currently viewing a historical track (null = live mode)
    val viewingHistoryTrack: TrackWithUserInfo? = null
)

class MapViewModel(
    private val context: Context,
    private val socketManager: SocketManager?
) : ViewModel() {

    companion object {
        private const val TAG = "MapViewModel"
        private const val MAX_CONCURRENT_TRACK_LOADS = 5
    }

    private val locationRepository = LocationRepository(context)

    // Helper to parse ISO date string to millis
    private fun parseIsoToMillis(iso: String?): Long? = iso?.let {
        runCatching { java.time.Instant.parse(it).toEpochMilli() }.getOrNull()
    }
    private val tokenManager = TokenManager(context)
    private val currentUserId: String? = tokenManager.getUserIdSync()

    private val _uiState = MutableStateFlow(MapUiState())
    val uiState: StateFlow<MapUiState> = _uiState.asStateFlow()

    init {
        loadUsers()
        observeSocketEvents()
        socketManager?.subscribeToLocations()
    }

    private fun observeSocketEvents() {
        socketManager?.let { manager ->
            // Observe location updates
            viewModelScope.launch {
                manager.userLocationUpdated.collect { event ->
                    val currentUsers = _uiState.value.users.toMutableList()
                    val existingIndex = currentUsers.indexOfFirst { it.id == event.userId }

                    if (existingIndex >= 0 && event.location != null) {
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
                        loadUsers()
                    }
                }
            }

            // Observe tracking changes
            viewModelScope.launch {
                manager.userTrackingChanged.collect { event ->
                    Log.d(TAG, "Tracking changed: ${event.userId} -> ${event.isTracking}")

                    _uiState.update { state ->
                        val newTrackingUsers = state.trackingUsers.toMutableSet()
                        val newTracks = state.tracks.toMutableMap()

                        if (event.isTracking) {
                            newTrackingUsers.add(event.userId)
                        } else {
                            newTrackingUsers.remove(event.userId)
                            newTracks.remove(event.userId)
                        }

                        // Update state in one mutation
                        state.copy(
                            trackingUsers = newTrackingUsers,
                            tracks = newTracks,
                            isMyTrackingActive = if (event.userId == currentUserId) event.isTracking else state.isMyTrackingActive,
                            myTrackingExpiresAt = if (event.userId == currentUserId) parseIsoToMillis(event.trackingExpiresAt) else state.myTrackingExpiresAt
                        )
                    }

                    // Load track for this user (outside update block)
                    if (event.isTracking && event.trackId != null) {
                        loadTrackForUser(event.userId)
                    }
                }
            }

            // Observe new track points
            viewModelScope.launch {
                manager.userTrackPoint.collect { event ->
                    Log.d(TAG, "Track point: ${event.userId} at ${event.point.lat},${event.point.lng}")

                    val tracks = _uiState.value.tracks.toMutableMap()
                    val userTrack = tracks[event.userId]?.toMutableList() ?: mutableListOf()
                    userTrack.add(
                        TrackPoint(
                            lat = event.point.lat,
                            lng = event.point.lng,
                            accuracy = event.point.accuracy,
                            timestamp = event.point.timestamp ?: ""
                        )
                    )
                    tracks[event.userId] = userTrack
                    _uiState.value = _uiState.value.copy(tracks = tracks)
                }
            }
        }
    }

    fun loadUsers() {
        viewModelScope.launch {
            val showLoading = _uiState.value.users.isEmpty()
            if (showLoading) {
                _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            }

            val result = locationRepository.getUsersWithLocations()
            result.fold(
                onSuccess = { users ->
                    val trackingUserIds = users.filter { it.isTracking == true }.map { it.id }.toSet()
                    val myUser = users.find { it.id == currentUserId }

                    _uiState.update { state ->
                        state.copy(
                            users = users,
                            isLoading = false,
                            trackingUsers = trackingUserIds,
                            isMyTrackingActive = myUser?.isTracking == true,
                            myTrackingExpiresAt = parseIsoToMillis(myUser?.trackingExpiresAt)
                        )
                    }

                    // Load tracks for users who are tracking (limit concurrent loads)
                    users.filter { it.isTracking == true }
                        .take(MAX_CONCURRENT_TRACK_LOADS)
                        .forEach { user -> loadTrackForUser(user.id) }
                },
                onFailure = { error ->
                    _uiState.update { it.copy(
                        errorMessage = error.message ?: "Erreur lors du chargement",
                        isLoading = false
                    ) }
                }
            )
        }
    }

    private fun loadTrackForUser(userId: String) {
        viewModelScope.launch {
            val result = locationRepository.getTrack(userId)
            result.fold(
                onSuccess = { track ->
                    if (track != null && track.points.isNotEmpty()) {
                        val tracks = _uiState.value.tracks.toMutableMap()
                        tracks[userId] = track.points
                        _uiState.value = _uiState.value.copy(tracks = tracks)
                    }
                },
                onFailure = { error ->
                    Log.e(TAG, "Failed to load track for $userId: ${error.message}")
                }
            )
        }
    }

    fun showTrackingDialog() {
        _uiState.value = _uiState.value.copy(showTrackingDialog = true)
    }

    fun dismissTrackingDialog() {
        _uiState.value = _uiState.value.copy(showTrackingDialog = false)
    }

    fun startTracking(durationMinutes: Int) {
        viewModelScope.launch {
            _uiState.update { it.copy(showTrackingDialog = false) }

            val result = locationRepository.setTracking(enabled = true, expiresInMinutes = durationMinutes)
            result.fold(
                onSuccess = { response ->
                    if (response.success) {
                        Log.d(TAG, "Tracking started, expires at: ${response.trackingExpiresAt}")
                        val expiresAtMillis = parseIsoToMillis(response.trackingExpiresAt)
                        _uiState.update { it.copy(
                            isMyTrackingActive = true,
                            myTrackingExpiresAt = expiresAtMillis
                        ) }

                        // Start the foreground service
                        TrackingService.startTracking(context, expiresAtMillis)
                    }
                },
                onFailure = { error ->
                    Log.e(TAG, "Failed to start tracking: ${error.message}")
                    _uiState.update { it.copy(errorMessage = "Erreur: ${error.message}") }
                }
            )
        }
    }

    fun stopTracking() {
        viewModelScope.launch {
            val result = locationRepository.setTracking(enabled = false)
            result.fold(
                onSuccess = { response ->
                    if (response.success) {
                        Log.d(TAG, "Tracking stopped")
                        _uiState.value = _uiState.value.copy(
                            isMyTrackingActive = false,
                            myTrackingExpiresAt = null
                        )

                        // Stop the foreground service
                        TrackingService.stopTracking(context)

                        // Remove our track from the map
                        currentUserId?.let { userId ->
                            val tracks = _uiState.value.tracks.toMutableMap()
                            tracks.remove(userId)
                            _uiState.value = _uiState.value.copy(tracks = tracks)
                        }
                    }
                },
                onFailure = { error ->
                    Log.e(TAG, "Failed to stop tracking: ${error.message}")
                    _uiState.value = _uiState.value.copy(
                        errorMessage = "Erreur: ${error.message}"
                    )
                }
            )
        }
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(errorMessage = null)
    }

    fun showHistoryDialog() {
        _uiState.value = _uiState.value.copy(showHistoryDialog = true)
        loadTrackHistory()
    }

    fun dismissHistoryDialog() {
        _uiState.value = _uiState.value.copy(showHistoryDialog = false)
    }

    private fun loadTrackHistory() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoadingHistory = true)

            val result = locationRepository.getTracks()
            result.fold(
                onSuccess = { tracks ->
                    _uiState.value = _uiState.value.copy(
                        trackHistory = tracks,
                        isLoadingHistory = false
                    )
                },
                onFailure = { error ->
                    Log.e(TAG, "Failed to load track history: ${error.message}")
                    _uiState.value = _uiState.value.copy(
                        isLoadingHistory = false,
                        errorMessage = "Erreur: ${error.message}"
                    )
                }
            )
        }
    }

    fun selectHistoryTrack(track: TrackSummary) {
        viewModelScope.launch {
            // Close dialog
            _uiState.value = _uiState.value.copy(showHistoryDialog = false)

            // Load full track details by ID
            val result = locationRepository.getTrackById(track.id)
            result.fold(
                onSuccess = { fullTrack ->
                    if (fullTrack != null && fullTrack.points.isNotEmpty()) {
                        // Clear existing tracks and show only the historical one
                        val historyTrackKey = "history_${track.id}"
                        val tracks = mapOf(
                            historyTrackKey to fullTrack.points.map { point ->
                                TrackPoint(
                                    lat = point.lat,
                                    lng = point.lng,
                                    accuracy = point.accuracy,
                                    timestamp = point.timestamp
                                )
                            }
                        )
                        _uiState.value = _uiState.value.copy(
                            tracks = tracks,
                            viewingHistoryTrack = fullTrack
                        )
                    }
                },
                onFailure = { error ->
                    Log.e(TAG, "Failed to load track: ${error.message}")
                    _uiState.value = _uiState.value.copy(
                        errorMessage = "Impossible de charger le trajet"
                    )
                }
            )
        }
    }

    fun exitHistoryMode() {
        _uiState.value = _uiState.value.copy(
            viewingHistoryTrack = null,
            tracks = emptyMap()
        )
        // Reload live data
        loadUsers()
    }

    override fun onCleared() {
        socketManager?.unsubscribeFromLocations()
        super.onCleared()
    }
}
