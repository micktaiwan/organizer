package com.organizer.chat.data.repository

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import com.organizer.chat.data.api.ApiClient
import com.organizer.chat.data.model.AppUpdateInfo
import com.organizer.chat.data.model.UpdateCheckResult

class UpdateRepository(private val context: Context) {

    private val api = ApiClient.getService()

    suspend fun checkForUpdate(): Result<UpdateCheckResult> {
        return try {
            val latestInfo = api.getLatestApkVersion()
            val currentVersionCode = getCurrentVersionCode()

            val updateAvailable = latestInfo.versionCode > currentVersionCode

            Result.success(
                UpdateCheckResult(
                    updateAvailable = updateAvailable,
                    currentVersionCode = currentVersionCode,
                    latestVersionCode = latestInfo.versionCode,
                    updateInfo = if (updateAvailable) latestInfo else null
                )
            )
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    fun getCurrentVersionCode(): Int {
        return try {
            val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                packageInfo.longVersionCode.toInt()
            } else {
                @Suppress("DEPRECATION")
                packageInfo.versionCode
            }
        } catch (e: PackageManager.NameNotFoundException) {
            0
        }
    }

    fun getCurrentVersionName(): String {
        return try {
            context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "unknown"
        } catch (e: PackageManager.NameNotFoundException) {
            "unknown"
        }
    }
}
