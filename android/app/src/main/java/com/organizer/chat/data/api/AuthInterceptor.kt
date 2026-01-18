package com.organizer.chat.data.api

import com.organizer.chat.util.TokenManager
import okhttp3.Interceptor
import okhttp3.Response

class AuthInterceptor(
    private val tokenManager: TokenManager
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val originalRequest = chain.request()

        // Skip auth header for login endpoint
        if (originalRequest.url.encodedPath.contains("auth/login")) {
            return chain.proceed(originalRequest)
        }

        val token = tokenManager.getTokenSync()

        val response = if (token != null) {
            val newRequest = originalRequest.newBuilder()
                .header("Authorization", "Bearer $token")
                .build()
            chain.proceed(newRequest)
        } else {
            chain.proceed(originalRequest)
        }

        // Detect 401 responses and notify session expired
        if (response.code == 401) {
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
