package com.organizer.chat.data.api

import android.util.Log
import com.google.gson.Gson
import com.organizer.chat.util.TokenManager
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

/**
 * Shared token refresh logic used by both AuthInterceptor (REST 401)
 * and SocketManager (socket connect_error with expired token).
 */
object TokenRefresher {

    private const val TAG = "TokenRefresher"
    private const val BASE_URL = "http://51.210.150.25:3001/"

    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()

    private val gson = Gson()
    private val refreshLock = Object()

    /**
     * Attempt to refresh the JWT token using the stored refresh token.
     * Synchronized to prevent multiple concurrent refreshes.
     * Returns the new token on success, null on failure.
     */
    fun tryRefresh(tokenManager: TokenManager): String? {
        synchronized(refreshLock) {
            val refreshToken = tokenManager.getRefreshTokenSync()
            if (refreshToken == null) {
                Log.d(TAG, "No refresh token available")
                return null
            }

            return try {
                val jsonBody = gson.toJson(RefreshTokenRequest(refreshToken))
                val requestBody = jsonBody.toRequestBody("application/json".toMediaType())

                val request = Request.Builder()
                    .url("${BASE_URL}auth/refresh")
                    .post(requestBody)
                    .build()

                val response = httpClient.newCall(request).execute()

                if (response.isSuccessful) {
                    val body = response.body?.string()
                    val result = gson.fromJson(body, RefreshTokenResponse::class.java)
                    if (result != null) {
                        tokenManager.saveTokensSync(result.token, result.refreshToken)
                        Log.d(TAG, "Token refresh successful")
                        result.token
                    } else {
                        Log.e(TAG, "Token refresh: empty response body")
                        null
                    }
                } else {
                    Log.e(TAG, "Token refresh failed: ${response.code}")
                    response.close()
                    null
                }
            } catch (e: Exception) {
                Log.e(TAG, "Token refresh error", e)
                null
            }
        }
    }
}
