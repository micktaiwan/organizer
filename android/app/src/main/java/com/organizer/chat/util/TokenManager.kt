package com.organizer.chat.util

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.runBlocking

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "auth")

class TokenManager(private val context: Context) {

    companion object {
        private val TOKEN_KEY = stringPreferencesKey("jwt_token")
        private val USER_ID_KEY = stringPreferencesKey("user_id")
        private val USERNAME_KEY = stringPreferencesKey("username")
        private val DISPLAY_NAME_KEY = stringPreferencesKey("display_name")
    }

    val token: Flow<String?> = context.dataStore.data.map { preferences ->
        preferences[TOKEN_KEY]
    }

    val userId: Flow<String?> = context.dataStore.data.map { preferences ->
        preferences[USER_ID_KEY]
    }

    val username: Flow<String?> = context.dataStore.data.map { preferences ->
        preferences[USERNAME_KEY]
    }

    val displayName: Flow<String?> = context.dataStore.data.map { preferences ->
        preferences[DISPLAY_NAME_KEY]
    }

    // Synchronous getter for interceptor (runs on IO thread in OkHttp)
    fun getTokenSync(): String? = runBlocking {
        context.dataStore.data.first()[TOKEN_KEY]
    }

    fun getUserIdSync(): String? = runBlocking {
        context.dataStore.data.first()[USER_ID_KEY]
    }

    suspend fun saveAuthData(token: String, userId: String, username: String, displayName: String) {
        context.dataStore.edit { preferences ->
            preferences[TOKEN_KEY] = token
            preferences[USER_ID_KEY] = userId
            preferences[USERNAME_KEY] = username
            preferences[DISPLAY_NAME_KEY] = displayName
        }
    }

    suspend fun clearAuthData() {
        context.dataStore.edit { preferences ->
            preferences.remove(TOKEN_KEY)
            preferences.remove(USER_ID_KEY)
            preferences.remove(USERNAME_KEY)
            preferences.remove(DISPLAY_NAME_KEY)
        }
    }

    suspend fun isLoggedIn(): Boolean {
        return context.dataStore.data.first()[TOKEN_KEY] != null
    }
}
