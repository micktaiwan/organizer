package com.organizer.chat.data.model

data class TrackPoint(
    val lat: Double,
    val lng: Double,
    val accuracy: Float?,
    val timestamp: String
)

data class Track(
    val id: String,
    val userId: String,
    val points: List<TrackPoint>,
    val startedAt: String,
    val isActive: Boolean
)

data class TrackResponse(
    val track: Track?
)

data class SetTrackingRequest(
    val enabled: Boolean,
    val expiresIn: Int? = null // minutes
)

data class TrackingResponse(
    val success: Boolean,
    val isTracking: Boolean,
    val trackingExpiresAt: String? = null,
    val trackId: String? = null
)

// Socket.io event data classes
data class TrackingChangedEvent(
    val userId: String,
    val username: String,
    val displayName: String,
    val isTracking: Boolean,
    val trackingExpiresAt: String?,
    val trackId: String?
)

data class TrackPointEvent(
    val userId: String,
    val trackId: String,
    val point: TrackPoint
)

// Track summary for list display
data class TrackSummary(
    val id: String,
    val userId: String,
    val username: String,
    val displayName: String,
    val startedAt: String,
    val endedAt: String?,
    val isActive: Boolean,
    val pointsCount: Int
)

data class TracksListResponse(
    val tracks: List<TrackSummary>
)

// Full track with user info (for history view)
data class TrackWithUserInfo(
    val id: String,
    val userId: String,
    val username: String,
    val displayName: String,
    val points: List<TrackPoint>,
    val startedAt: String,
    val endedAt: String?,
    val isActive: Boolean
)

data class TrackByIdResponse(
    val track: TrackWithUserInfo?
)
