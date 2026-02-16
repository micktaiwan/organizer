package com.organizer.chat.data.api

import android.util.Log
import com.organizer.chat.util.TokenManager
import okhttp3.Interceptor
import okhttp3.Response

class AuthInterceptor(
    private val tokenManager: TokenManager
) : Interceptor {

    companion object {
        private const val TAG = "AuthInterceptor"
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

            val newToken = TokenRefresher.tryRefresh(tokenManager)
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
}
