package com.organizer.chat.data.model

import com.google.gson.annotations.SerializedName

data class UserLocation(
    val lat: Double,
    val lng: Double,
    val street: String?,
    val city: String?,
    val country: String?,
    val updatedAt: String?
)

data class AppVersion(
    val versionName: String,
    val versionCode: Int,
    val updatedAt: String?
)

data class UserWithLocation(
    @SerializedName("_id")
    val id: String,
    val username: String,
    val displayName: String,
    val isOnline: Boolean,
    val location: UserLocation?,
    val appVersion: AppVersion?,
    val status: String = "available",
    val statusMessage: String? = null,
    val statusExpiresAt: String? = null,
    // Tracking mode
    val isTracking: Boolean? = false,
    val trackingExpiresAt: String? = null,
    val currentTrackId: String? = null
)

// API Responses
data class UsersWithLocationResponse(
    val users: List<UserWithLocation>
)

data class LocationUpdateResponse(
    val success: Boolean,
    val location: UserLocation?
)

// API Requests
data class UpdateLocationRequest(
    val lat: Double,
    val lng: Double,
    val accuracy: Float?,
    val street: String?,
    val city: String?,
    val country: String?
)

// Location History
data class LocationHistoryEntry(
    val lat: Double,
    val lng: Double,
    val accuracy: Float?,
    val street: String?,
    val city: String?,
    val country: String?,
    val createdAt: String
)

data class LocationHistoryResponse(
    val history: List<LocationHistoryEntry>
)

