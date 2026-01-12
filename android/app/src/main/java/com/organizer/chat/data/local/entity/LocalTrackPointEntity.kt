package com.organizer.chat.data.local.entity

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "local_track_points",
    foreignKeys = [
        ForeignKey(
            entity = LocalTrackEntity::class,
            parentColumns = ["id"],
            childColumns = ["trackId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [Index("trackId")]
)
data class LocalTrackPointEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val trackId: String,                // Reference to LocalTrack
    val lat: Double,
    val lng: Double,
    val accuracy: Float? = null,
    val timestamp: Long,                // Capture timestamp
    val street: String? = null,
    val city: String? = null,
    val country: String? = null
)
