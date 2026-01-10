package com.organizer.chat.data.model

data class AppUpdateInfo(
    val version: String,
    val versionCode: Int,
    val fileSize: Long,
    val checksum: String,
    val releaseNotes: String,
    val downloadUrl: String,
    val createdAt: String
)

data class UpdateCheckResult(
    val updateAvailable: Boolean,
    val currentVersionCode: Int,
    val latestVersionCode: Int,
    val updateInfo: AppUpdateInfo? = null
)
