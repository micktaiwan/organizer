package com.organizer.chat.data.repository

import android.content.Context
import android.util.Log
import com.organizer.chat.data.local.AppDatabase
import com.organizer.chat.data.local.entity.LocalTrackEntity
import com.organizer.chat.data.local.entity.LocalTrackPointEntity
import com.organizer.chat.data.local.entity.SyncStatus
import kotlinx.coroutines.flow.Flow
import java.util.UUID

class LocalTrackRepository(context: Context) {

    companion object {
        private const val TAG = "LocalTrackRepository"
    }

    private val dao = AppDatabase.getInstance(context).localTrackDao()

    suspend fun createTrack(): String {
        val trackId = UUID.randomUUID().toString()
        val track = LocalTrackEntity(
            id = trackId,
            startedAt = System.currentTimeMillis(),
            syncStatus = SyncStatus.PENDING
        )
        dao.insertTrack(track)
        Log.d(TAG, "Created local track: $trackId")
        return trackId
    }

    suspend fun addPoint(
        trackId: String,
        lat: Double,
        lng: Double,
        accuracy: Float?,
        street: String?,
        city: String?,
        country: String?
    ) {
        val point = LocalTrackPointEntity(
            trackId = trackId,
            lat = lat,
            lng = lng,
            accuracy = accuracy,
            timestamp = System.currentTimeMillis(),
            street = street,
            city = city,
            country = country
        )
        dao.insertPoint(point)
        Log.d(TAG, "Added point to track $trackId: ($lat, $lng)")
    }

    suspend fun stopTrack(trackId: String) {
        dao.setStoppedAt(trackId, System.currentTimeMillis())
        Log.d(TAG, "Stopped track: $trackId")
    }

    suspend fun getTrackWithPoints(trackId: String): Pair<LocalTrackEntity, List<LocalTrackPointEntity>>? {
        return dao.getTrackWithPoints(trackId)
    }

    suspend fun getPendingTracks(): List<LocalTrackEntity> {
        return dao.getTracksByStatus(listOf(SyncStatus.PENDING, SyncStatus.FAILED))
    }

    fun getUnsyncedTracksFlow(): Flow<List<LocalTrackEntity>> {
        return dao.getUnsyncedTracksFlow()
    }

    suspend fun getPoints(trackId: String): List<LocalTrackPointEntity> {
        return dao.getPointsByTrackId(trackId)
    }

    suspend fun getPointsCount(trackId: String): Int {
        return dao.getPointsCount(trackId)
    }

    suspend fun updateSyncStatus(trackId: String, status: SyncStatus, error: String? = null) {
        dao.updateSyncStatus(trackId, status, System.currentTimeMillis(), error)
        Log.d(TAG, "Updated sync status for $trackId: $status ${error?.let { "($it)" } ?: ""}")
    }

    suspend fun markAsSynced(trackId: String, serverTrackId: String) {
        dao.markAsSynced(trackId, serverTrackId)
        Log.d(TAG, "Track $trackId synced as $serverTrackId")
    }

    suspend fun setServerTrackId(trackId: String, serverTrackId: String) {
        dao.setServerTrackId(trackId, serverTrackId)
        Log.d(TAG, "Track $trackId linked to server track $serverTrackId")
    }

    suspend fun deleteTrack(trackId: String) {
        dao.deleteTrackWithPoints(trackId)
        Log.d(TAG, "Deleted track: $trackId")
    }

    suspend fun deleteSyncedTracks() {
        dao.deleteTracksByStatus(SyncStatus.SYNCED)
        Log.d(TAG, "Deleted all synced tracks")
    }
}
