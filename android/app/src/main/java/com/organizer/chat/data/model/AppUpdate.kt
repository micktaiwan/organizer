package com.organizer.chat.data.model

import java.io.File

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

// Download states
sealed class DownloadStatus {
    object Idle : DownloadStatus()
    data class Downloading(
        val progress: Int,
        val totalBytes: Long,
        val downloadedBytes: Long
    ) : DownloadStatus()
    object Verifying : DownloadStatus()
    data class ReadyToInstall(val file: File) : DownloadStatus()
    data class Error(val error: UpdateError) : DownloadStatus()
}

sealed class UpdateError(val userMessage: String, val canRetry: Boolean) {
    object NetworkError : UpdateError("Erreur réseau. Vérifiez votre connexion.", true)
    object StorageFull : UpdateError("Espace de stockage insuffisant.", false)
    object ChecksumMismatch : UpdateError("Fichier corrompu. Veuillez réessayer.", true)
    object DownloadCancelled : UpdateError("Téléchargement annulé.", true)
    data class DownloadFailed(val reason: Int) : UpdateError("Erreur de téléchargement (code $reason)", true)
    data class Unknown(val message: String) : UpdateError("Erreur: $message", true)
}

data class UpdateDownloadState(
    val status: DownloadStatus = DownloadStatus.Idle,
    val updateInfo: AppUpdateInfo? = null,
    val downloadId: Long = -1
)

// Version history response
data class ApkVersionsResponse(
    val versions: List<ApkVersionInfo>
)

data class ApkVersionInfo(
    val version: String,
    val versionCode: Int,
    val releaseNotes: String,
    val isLatest: Boolean,
    val createdAt: String
)
