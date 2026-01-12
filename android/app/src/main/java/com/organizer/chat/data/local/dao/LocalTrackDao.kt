package com.organizer.chat.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Update
import com.organizer.chat.data.local.entity.LocalTrackEntity
import com.organizer.chat.data.local.entity.LocalTrackPointEntity
import com.organizer.chat.data.local.entity.SyncStatus
import kotlinx.coroutines.flow.Flow

@Dao
interface LocalTrackDao {

    // ========== Track operations ==========

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertTrack(track: LocalTrackEntity)

    @Update
    suspend fun updateTrack(track: LocalTrackEntity)

    @Query("SELECT * FROM local_tracks WHERE id = :trackId")
    suspend fun getTrackById(trackId: String): LocalTrackEntity?

    // Only returns finished tracks (stoppedAt != null) with requested statuses
    @Query("SELECT * FROM local_tracks WHERE syncStatus IN (:statuses) AND stoppedAt IS NOT NULL ORDER BY startedAt DESC")
    suspend fun getTracksByStatus(statuses: List<SyncStatus>): List<LocalTrackEntity>

    // Only returns finished tracks (stoppedAt != null) that are not synced
    @Query("SELECT * FROM local_tracks WHERE syncStatus != :status AND stoppedAt IS NOT NULL ORDER BY startedAt DESC")
    fun getUnsyncedTracksFlow(status: SyncStatus = SyncStatus.SYNCED): Flow<List<LocalTrackEntity>>

    @Query("UPDATE local_tracks SET syncStatus = :status, lastSyncAttempt = :timestamp, syncError = :error WHERE id = :trackId")
    suspend fun updateSyncStatus(trackId: String, status: SyncStatus, timestamp: Long? = null, error: String? = null)

    @Query("UPDATE local_tracks SET serverTrackId = :serverTrackId, syncStatus = :status WHERE id = :trackId")
    suspend fun markAsSynced(trackId: String, serverTrackId: String, status: SyncStatus = SyncStatus.SYNCED)

    @Query("UPDATE local_tracks SET stoppedAt = :stoppedAt WHERE id = :trackId")
    suspend fun setStoppedAt(trackId: String, stoppedAt: Long)

    @Query("DELETE FROM local_tracks WHERE id = :trackId")
    suspend fun deleteTrack(trackId: String)

    @Query("DELETE FROM local_tracks WHERE syncStatus = :status")
    suspend fun deleteTracksByStatus(status: SyncStatus)

    // ========== Point operations ==========

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertPoint(point: LocalTrackPointEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertPoints(points: List<LocalTrackPointEntity>)

    @Query("SELECT * FROM local_track_points WHERE trackId = :trackId ORDER BY timestamp ASC")
    suspend fun getPointsByTrackId(trackId: String): List<LocalTrackPointEntity>

    @Query("SELECT COUNT(*) FROM local_track_points WHERE trackId = :trackId")
    suspend fun getPointsCount(trackId: String): Int

    @Query("DELETE FROM local_track_points WHERE trackId = :trackId")
    suspend fun deletePointsByTrackId(trackId: String)

    // ========== Combined operations ==========

    @Transaction
    suspend fun deleteTrackWithPoints(trackId: String) {
        deletePointsByTrackId(trackId)
        deleteTrack(trackId)
    }

    @Transaction
    suspend fun getTrackWithPoints(trackId: String): Pair<LocalTrackEntity, List<LocalTrackPointEntity>>? {
        val track = getTrackById(trackId) ?: return null
        val points = getPointsByTrackId(trackId)
        return Pair(track, points)
    }
}
