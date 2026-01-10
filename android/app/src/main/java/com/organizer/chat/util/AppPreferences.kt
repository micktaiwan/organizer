package com.organizer.chat.util

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.appDataStore: DataStore<Preferences> by preferencesDataStore(name = "app_prefs")

class AppPreferences(private val context: Context) {

    companion object {
        private val RELEASE_NOTES_KEY = stringPreferencesKey("release_notes")
        private val APP_VERSION_KEY = stringPreferencesKey("app_version")
    }

    val releaseNotes: Flow<String?> = context.appDataStore.data.map { preferences ->
        preferences[RELEASE_NOTES_KEY]
    }

    val appVersion: Flow<String?> = context.appDataStore.data.map { preferences ->
        preferences[APP_VERSION_KEY]
    }

    suspend fun saveReleaseNotes(version: String, notes: String) {
        context.appDataStore.edit { preferences ->
            preferences[APP_VERSION_KEY] = version
            preferences[RELEASE_NOTES_KEY] = notes
        }
    }
}
