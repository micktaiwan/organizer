package com.organizer.chat.worker

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.organizer.chat.data.repository.LocationRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.concurrent.TimeUnit

class LocationUpdateWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    companion object {
        private const val TAG = "LocationUpdateWorker"
        private const val WORK_NAME = "location_update_work"

        fun schedule(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val request = PeriodicWorkRequestBuilder<LocationUpdateWorker>(
                10, TimeUnit.MINUTES,
                5, TimeUnit.MINUTES // Flex interval
            )
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 1, TimeUnit.MINUTES)
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                request
            )
            Log.d(TAG, "Location update worker scheduled")
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
            Log.d(TAG, "Location update worker cancelled")
        }
    }

    override suspend fun doWork(): Result {
        // Check permissions
        if (!hasLocationPermission()) {
            Log.w(TAG, "Location permission not granted")
            return Result.failure()
        }

        return withContext(Dispatchers.IO) {
            try {
                val repository = LocationRepository(applicationContext)

                // Get current location
                val locationResult = repository.getCurrentLocation()
                if (locationResult.isFailure) {
                    Log.e(TAG, "Failed to get location: ${locationResult.exceptionOrNull()?.message}")
                    return@withContext Result.retry()
                }

                val location = locationResult.getOrThrow()

                // Reverse geocode
                val address = repository.reverseGeocode(location.latitude, location.longitude)

                // Send to server
                val updateResult = repository.updateLocation(
                    lat = location.latitude,
                    lng = location.longitude,
                    street = address?.street,
                    city = address?.city,
                    country = address?.country
                )

                if (updateResult.isSuccess) {
                    Log.d(TAG, "Location updated: ${location.latitude}, ${location.longitude} - ${address?.street}, ${address?.city}")
                    Result.success()
                } else {
                    Log.e(TAG, "Failed to update location on server: ${updateResult.exceptionOrNull()?.message}")
                    Result.retry()
                }
            } catch (e: Exception) {
                Log.e(TAG, "Location update failed", e)
                Result.retry()
            }
        }
    }

    private fun hasLocationPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            applicationContext,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
    }
}
