package com.organizer.chat.service

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.util.Log
import com.organizer.chat.data.api.ApiClient
import com.organizer.chat.data.local.entity.SyncStatus
import com.organizer.chat.data.repository.LocalTrackRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex

/**
 * Manages local track synchronization with the server.
 * Listens to network changes and syncs automatically when available.
 */
class TrackSyncManager private constructor(context: Context) {

    companion object {
        private const val TAG = "TrackSyncManager"

        @Volatile
        private var INSTANCE: TrackSyncManager? = null

        fun getInstance(context: Context): TrackSyncManager {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: TrackSyncManager(context.applicationContext).also { INSTANCE = it }
            }
        }
    }

    private val localTrackRepository = LocalTrackRepository(context)
    private val api = ApiClient.getService()
    private val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val syncMutex = Mutex()

    private val _isSyncing = MutableStateFlow(false)
    val isSyncing: StateFlow<Boolean> = _isSyncing.asStateFlow()

    private val _pendingTracksCount = MutableStateFlow(0)
    val pendingTracksCount: StateFlow<Int> = _pendingTracksCount.asStateFlow()

    private var isNetworkCallbackRegistered = false

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            Log.d(TAG, "Network available, triggering sync")
            syncPendingTracks()
        }

        override fun onLost(network: Network) {
            Log.d(TAG, "Network lost")
        }
    }

    init {
        scope.launch {
            localTrackRepository.getUnsyncedTracksFlow().collect { tracks ->
                _pendingTracksCount.value = tracks.size
            }
        }
    }

    fun startNetworkMonitoring() {
        if (isNetworkCallbackRegistered) return

        val networkRequest = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()

        try {
            connectivityManager.registerNetworkCallback(networkRequest, networkCallback)
            isNetworkCallbackRegistered = true
            Log.d(TAG, "Network monitoring started")

            if (isNetworkAvailable()) {
                syncPendingTracks()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register network callback", e)
        }
    }

    fun stopNetworkMonitoring() {
        if (!isNetworkCallbackRegistered) return

        try {
            connectivityManager.unregisterNetworkCallback(networkCallback)
            isNetworkCallbackRegistered = false
            Log.d(TAG, "Network monitoring stopped")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to unregister network callback", e)
        }
    }

    fun isNetworkAvailable(): Boolean {
        val network = connectivityManager.activeNetwork ?: return false
        val capabilities = connectivityManager.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    fun syncPendingTracks() {
        scope.launch {
            syncPendingTracksInternal()
        }
    }

    fun syncTrack(trackId: String) {
        scope.launch {
            syncTrackInternal(trackId)
        }
    }

    private suspend fun syncPendingTracksInternal() {
        if (!syncMutex.tryLock()) {
            Log.d(TAG, "Sync already in progress, skipping")
            return
        }

        try {
            _isSyncing.value = true

            if (!isNetworkAvailable()) {
                Log.d(TAG, "No network, skipping sync")
                return
            }

            val pendingTracks = localTrackRepository.getPendingTracks()
            Log.d(TAG, "Found ${pendingTracks.size} pending tracks to sync")

            for (track in pendingTracks) {
                syncTrackInternal(track.id)
            }
        } finally {
            _isSyncing.value = false
            syncMutex.unlock()
        }
    }

    private suspend fun syncTrackInternal(trackId: String) {
        val trackWithPoints = localTrackRepository.getTrackWithPoints(trackId)
        if (trackWithPoints == null) {
            Log.w(TAG, "Track $trackId not found")
            return
        }

        val (track, points) = trackWithPoints

        if (track.syncStatus == SyncStatus.SYNCED) {
            Log.d(TAG, "Track $trackId already synced")
            return
        }

        if (track.stoppedAt == null) {
            Log.d(TAG, "Track $trackId still active, skipping sync")
            return
        }

        // Delete tracks with no points (nothing to sync)
        if (points.isEmpty()) {
            Log.d(TAG, "Track $trackId has no points, deleting")
            localTrackRepository.deleteTrack(trackId)
            return
        }

        Log.d(TAG, "Syncing track $trackId with ${points.size} points")

        try {
            localTrackRepository.updateSyncStatus(trackId, SyncStatus.SYNCING)

            val response = api.syncTrack(
                SyncTrackRequest(
                    localTrackId = trackId,
                    startedAt = track.startedAt,
                    stoppedAt = track.stoppedAt,
                    points = points.map { point ->
                        SyncTrackPoint(
                            lat = point.lat,
                            lng = point.lng,
                            accuracy = point.accuracy,
                            timestamp = point.timestamp,
                            street = point.street,
                            city = point.city,
                            country = point.country
                        )
                    }
                )
            )

            if (response.success && response.trackId != null) {
                localTrackRepository.markAsSynced(trackId, response.trackId)
                Log.d(TAG, "Track $trackId synced successfully as ${response.trackId}")
            } else {
                localTrackRepository.updateSyncStatus(trackId, SyncStatus.FAILED, "Server returned error")
                Log.e(TAG, "Server rejected sync for track $trackId")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to sync track $trackId", e)
            localTrackRepository.updateSyncStatus(trackId, SyncStatus.FAILED, e.message)
        }
    }

    suspend fun cleanupSyncedTracks() {
        localTrackRepository.deleteSyncedTracks()
        Log.d(TAG, "Cleaned up synced tracks")
    }
}

data class SyncTrackRequest(
    val localTrackId: String,
    val startedAt: Long,
    val stoppedAt: Long,
    val points: List<SyncTrackPoint>
)

data class SyncTrackPoint(
    val lat: Double,
    val lng: Double,
    val accuracy: Float?,
    val timestamp: Long,
    val street: String?,
    val city: String?,
    val country: String?
)

data class SyncTrackResponse(
    val success: Boolean,
    val trackId: String? = null,
    val error: String? = null
)
