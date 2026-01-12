package com.organizer.chat.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

enum class SyncStatus {
    PENDING,
    SYNCING,
    SYNCED,
    FAILED
}

@Entity(tableName = "local_tracks")
data class LocalTrackEntity(
    @PrimaryKey
    val id: String,                     // Locally generated UUID
    val serverTrackId: String? = null,  // Server track ID (after sync)
    val startedAt: Long,                // Start timestamp
    val stoppedAt: Long? = null,        // End timestamp
    val syncStatus: SyncStatus = SyncStatus.PENDING,
    val lastSyncAttempt: Long? = null,  // Last sync attempt timestamp
    val syncError: String? = null       // Error message if sync failed
)
