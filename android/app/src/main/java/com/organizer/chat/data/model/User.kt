package com.organizer.chat.data.model

import com.google.gson.annotations.SerializedName

data class User(
    @SerializedName("_id", alternate = ["id"])
    val id: String,
    val username: String,
    val displayName: String,
    val email: String? = null,
    val isOnline: Boolean = false,
    val isAdmin: Boolean = false,
    val status: String = "available",
    val statusMessage: String? = null,
    val lastSeen: String? = null
)

data class LoginRequest(
    val username: String,
    val password: String
)

data class RegisterRequest(
    val username: String,
    val displayName: String,
    val email: String,
    val password: String
)

data class LoginResponse(
    val token: String,
    val user: User
)

data class UserResponse(
    val user: User
)
