package com.organizer.chat.data.repository

import com.organizer.chat.data.api.ApiClient
import com.organizer.chat.data.model.LoginRequest
import com.organizer.chat.data.model.RegisterRequest
import com.organizer.chat.data.model.User
import com.organizer.chat.util.TokenManager

class AuthRepository(
    private val tokenManager: TokenManager
) {
    private val api = ApiClient.getService()

    suspend fun login(username: String, password: String): Result<User> {
        return try {
            val response = api.login(LoginRequest(username, password))

            // Save auth data
            tokenManager.saveAuthData(
                token = response.token,
                userId = response.user.id,
                username = response.user.username,
                displayName = response.user.displayName
            )

            Result.success(response.user)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun register(
        username: String,
        displayName: String,
        email: String,
        password: String
    ): Result<User> {
        return try {
            val response = api.register(
                RegisterRequest(username, displayName, email, password)
            )

            // Save auth data (auto-login after register)
            tokenManager.saveAuthData(
                token = response.token,
                userId = response.user.id,
                username = response.user.username,
                displayName = response.user.displayName
            )

            Result.success(response.user)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getCurrentUser(): Result<User> {
        return try {
            val response = api.getCurrentUser()
            Result.success(response.user)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun logout() {
        tokenManager.clearAuthData()
    }

    suspend fun isLoggedIn(): Boolean {
        return tokenManager.isLoggedIn()
    }
}
