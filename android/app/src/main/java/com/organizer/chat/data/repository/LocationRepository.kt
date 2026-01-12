package com.organizer.chat.data.repository

import android.content.Context
import android.location.Geocoder
import android.os.Build
import android.util.Log
import com.google.android.gms.location.CurrentLocationRequest
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.organizer.chat.data.api.ApiClient
import com.organizer.chat.data.model.LocationHistoryEntry
import com.organizer.chat.data.model.SetTrackingRequest
import com.organizer.chat.data.model.Track
import com.organizer.chat.data.model.TrackingResponse
import com.organizer.chat.data.model.TrackSummary
import com.organizer.chat.data.model.TrackWithUserInfo
import com.organizer.chat.data.model.UpdateLocationRequest
import com.organizer.chat.data.model.UserLocation
import com.organizer.chat.data.model.UserWithLocation
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import java.util.Locale
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class LocationRepository(private val context: Context) {

    companion object {
        private const val TAG = "LocationRepository"
    }

    private val api = ApiClient.getService()
    private val fusedLocationClient = LocationServices.getFusedLocationProviderClient(context)
    private val geocoder = Geocoder(context, Locale.getDefault())

    suspend fun getUsersWithLocations(): Result<List<UserWithLocation>> {
        return try {
            val response = api.getUsersWithLocations()
            Result.success(response.users)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get users with locations", e)
            Result.failure(e)
        }
    }

    suspend fun updateLocation(
        lat: Double,
        lng: Double,
        accuracy: Float?,
        street: String?,
        city: String?,
        country: String?
    ): Result<UserLocation?> {
        return try {
            val request = UpdateLocationRequest(lat, lng, accuracy, street, city, country)
            val response = api.updateLocation(request)
            Result.success(response.location)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to update location", e)
            Result.failure(e)
        }
    }

    @Suppress("MissingPermission")
    suspend fun getCurrentLocation(): Result<android.location.Location> {
        return try {
            val locationRequest = CurrentLocationRequest.Builder()
                .setPriority(Priority.PRIORITY_HIGH_ACCURACY)
                .setMaxUpdateAgeMillis(60_000) // Accept location up to 1 minute old
                .build()

            val location = suspendCancellableCoroutine { cont ->
                fusedLocationClient.getCurrentLocation(locationRequest, null)
                    .addOnSuccessListener { location ->
                        if (location != null) {
                            cont.resume(location)
                        } else {
                            cont.resumeWithException(Exception("Location unavailable"))
                        }
                    }
                    .addOnFailureListener { e ->
                        cont.resumeWithException(e)
                    }
            }
            Result.success(location)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get current location", e)
            Result.failure(e)
        }
    }

    suspend fun getLocationHistory(userId: String, limit: Int = 10): Result<List<LocationHistoryEntry>> {
        return try {
            val response = api.getLocationHistory(userId, limit)
            Result.success(response.history)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get location history for user $userId", e)
            Result.failure(e)
        }
    }

    suspend fun reverseGeocode(lat: Double, lng: Double): GeocodedAddress? = withContext(Dispatchers.IO) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                // Android 13+ async version
                suspendCancellableCoroutine { cont ->
                    geocoder.getFromLocation(lat, lng, 1) { addresses ->
                        if (addresses.isNotEmpty()) {
                            val addr = addresses[0]
                            cont.resume(
                                GeocodedAddress(
                                    street = addr.thoroughfare ?: addr.subLocality,
                                    city = addr.locality ?: addr.subAdminArea,
                                    country = addr.countryName
                                )
                            )
                        } else {
                            cont.resume(null)
                        }
                    }
                }
            } else {
                @Suppress("DEPRECATION")
                val addresses = geocoder.getFromLocation(lat, lng, 1)
                if (!addresses.isNullOrEmpty()) {
                    val addr = addresses[0]
                    GeocodedAddress(
                        street = addr.thoroughfare ?: addr.subLocality,
                        city = addr.locality ?: addr.subAdminArea,
                        country = addr.countryName
                    )
                } else null
            }
        } catch (e: Exception) {
            Log.e(TAG, "Reverse geocoding failed", e)
            null
        }
    }

    // Tracking methods
    suspend fun setTracking(enabled: Boolean, expiresInMinutes: Int? = null): Result<TrackingResponse> {
        return try {
            val request = SetTrackingRequest(enabled, expiresInMinutes)
            val response = api.setTracking(request)
            Result.success(response)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to set tracking", e)
            Result.failure(e)
        }
    }

    suspend fun getTrack(userId: String): Result<Track?> {
        return try {
            val response = api.getTrack(userId)
            Result.success(response.track)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get track for user $userId", e)
            Result.failure(e)
        }
    }

    suspend fun getTracks(userId: String? = null): Result<List<TrackSummary>> {
        return try {
            val response = api.getTracks(userId)
            Result.success(response.tracks)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get tracks", e)
            Result.failure(e)
        }
    }

    suspend fun getTrackById(trackId: String): Result<TrackWithUserInfo?> {
        return try {
            val response = api.getTrackById(trackId)
            Result.success(response.track)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get track by id $trackId", e)
            Result.failure(e)
        }
    }

    suspend fun deleteTrack(trackId: String): Result<Boolean> {
        return try {
            val response = api.deleteTrack(trackId)
            Result.success(response.success)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to delete track $trackId", e)
            Result.failure(e)
        }
    }
}

data class GeocodedAddress(
    val street: String?,
    val city: String?,
    val country: String?
)
