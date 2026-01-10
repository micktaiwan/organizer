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

data class UserWithLocation(
    @SerializedName("_id")
    val id: String,
    val username: String,
    val displayName: String,
    val isOnline: Boolean,
    val location: UserLocation?
)

// API Responses
data class UsersWithLocationResponse(
    val users: List<UserWithLocation>
)

data class LocationUpdateResponse(
    val success: Boolean,
    val location: UserLocation?
)

// API Request
data class UpdateLocationRequest(
    val lat: Double,
    val lng: Double,
    val street: String?,
    val city: String?,
    val country: String?
)
