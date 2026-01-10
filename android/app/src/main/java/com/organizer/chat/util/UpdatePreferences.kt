package com.organizer.chat.util

import android.content.Context
import android.content.SharedPreferences
import com.organizer.chat.data.model.AppUpdateInfo

class UpdatePreferences(context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences("update_prefs", Context.MODE_PRIVATE)

    companion object {
        private const val KEY_DOWNLOAD_ID = "download_id"
        private const val KEY_VERSION = "version"
        private const val KEY_VERSION_CODE = "version_code"
        private const val KEY_CHECKSUM = "checksum"
        private const val KEY_FILE_NAME = "file_name"
        private const val KEY_START_TIME = "start_time"
    }

    fun saveDownloadState(downloadId: Long, updateInfo: AppUpdateInfo, fileName: String) {
        prefs.edit().apply {
            putLong(KEY_DOWNLOAD_ID, downloadId)
            putString(KEY_VERSION, updateInfo.version)
            putInt(KEY_VERSION_CODE, updateInfo.versionCode)
            putString(KEY_CHECKSUM, updateInfo.checksum)
            putString(KEY_FILE_NAME, fileName)
            putLong(KEY_START_TIME, System.currentTimeMillis())
            apply()
        }
    }

    fun getDownloadId(): Long = prefs.getLong(KEY_DOWNLOAD_ID, -1)

    fun getExpectedChecksum(): String? = prefs.getString(KEY_CHECKSUM, null)

    fun getFileName(): String? = prefs.getString(KEY_FILE_NAME, null)

    fun getStartTime(): Long = prefs.getLong(KEY_START_TIME, 0)

    fun hasActiveDownload(): Boolean = getDownloadId() != -1L

    fun clearDownloadState() {
        prefs.edit().clear().apply()
    }

    fun isDownloadTooOld(maxAgeMinutes: Int = 30): Boolean {
        val startTime = getStartTime()
        if (startTime == 0L) return false
        val ageMinutes = (System.currentTimeMillis() - startTime) / (1000 * 60)
        return ageMinutes > maxAgeMinutes
    }
}
