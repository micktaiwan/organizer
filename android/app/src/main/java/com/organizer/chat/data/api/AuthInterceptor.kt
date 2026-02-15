package com.organizer.chat.data.api

import android.util.Log
import com.google.gson.Gson
import com.organizer.chat.util.TokenManager
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.util.concurrent.TimeUnit

class AuthInterceptor(
    private val tokenManager: TokenManager
) : Interceptor {

    companion object {
        private const val TAG = "AuthInterceptor"
        private const val BASE_URL = "http://51.210.150.25:3001/"

        // Separate client for refresh calls to avoid interceptor loop
        private val refreshClient = OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(10, TimeUnit.SECONDS)
            .build()

        private val gson = Gson()

        // Lock to prevent concurrent refresh attempts
        private val refreshLock = Object()
    }

    override fun intercept(chain: Interceptor.Chain): Response {
        val originalRequest = chain.request()

        // Skip auth header for login/register/refresh endpoints
        val path = originalRequest.url.encodedPath
        if (path.contains("auth/login") || path.contains("auth/register") || path.contains("auth/refresh")) {
            return chain.proceed(originalRequest)
        }

        val token = tokenManager.getTokenSync()

        val request = if (token != null) {
            originalRequest.newBuilder()
                .header("Authorization", "Bearer $token")
                .build()
        } else {
            originalRequest
        }

        val response = chain.proceed(request)

        if (response.code == 401) {
            Log.d(TAG, "Got 401, attempting token refresh...")

            val newToken = tryRefreshToken()
            if (newToken != null) {
                Log.d(TAG, "Token refreshed, retrying request")
                response.close()
                val retryRequest = originalRequest.newBuilder()
                    .header("Authorization", "Bearer $newToken")
                    .build()
                return chain.proceed(retryRequest)
            }

            // Refresh failed - session is truly expired
            Log.d(TAG, "Token refresh failed, session expired")
            val body = response.peekBody(1024).string()
            val reason = when {
                body.contains("Token expiré") -> "Ton token a expiré, reconnecte-toi"
                body.contains("Token invalide") -> "Token invalide, reconnecte-toi"
                else -> "Session expirée, reconnecte-toi"
            }
            tokenManager.notifySessionExpired(reason)
        }

        return response
    }

    /**
     * Attempt to refresh the JWT token using the stored refresh token.
     * Synchronized to prevent multiple concurrent refreshes.
     * Returns the new token on success, null on failure.
     */
    private fun tryRefreshToken(): String? {
        synchronized(refreshLock) {
            val refreshToken = tokenManager.getRefreshTokenSync() ?: run {
                Log.d(TAG, "No refresh token available")
                return null
            }

            // Check if another thread already refreshed (token might be fresh now)
            // We can't easily check this without more state, so just proceed

            return try {
                val jsonBody = gson.toJson(RefreshTokenRequest(refreshToken))
                val requestBody = jsonBody.toRequestBody("application/json".toMediaType())

                val request = Request.Builder()
                    .url("${BASE_URL}auth/refresh")
                    .post(requestBody)
                    .build()

                val response = refreshClient.newCall(request).execute()

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
