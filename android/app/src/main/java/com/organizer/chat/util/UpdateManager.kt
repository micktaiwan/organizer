package com.organizer.chat.util

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.util.Log
import androidx.core.content.FileProvider
import com.organizer.chat.data.model.AppUpdateInfo
import com.organizer.chat.data.model.DownloadStatus
import com.organizer.chat.data.model.UpdateDownloadState
import com.organizer.chat.data.model.UpdateError
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import java.io.File
import java.security.MessageDigest

class UpdateManager(private val context: Context) {

    companion object {
        private const val TAG = "UpdateManager"
        private const val BASE_URL = "http://51.210.150.25:3001"
        private const val APK_MIME_TYPE = "application/vnd.android.package-archive"
    }

    private val updatePrefs = UpdatePreferences(context)
    private val _downloadState = MutableStateFlow(UpdateDownloadState())
    val downloadState: StateFlow<UpdateDownloadState> = _downloadState.asStateFlow()

    private var currentDownloadId: Long = -1
    private var downloadReceiver: BroadcastReceiver? = null
    private var progressJob: Job? = null

    /**
     * Download and install APK with progress tracking and checksum verification
     */
    fun downloadAndInstall(updateInfo: AppUpdateInfo) {
        val downloadUrl = "$BASE_URL${updateInfo.downloadUrl}"
        val fileName = "organizer-${updateInfo.version}.apk"

        Log.d(TAG, "Starting download: $downloadUrl")

        // Delete old APK if exists
        val oldFile = File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), fileName)
        if (oldFile.exists()) {
            oldFile.delete()
        }

        // Create download request
        val request = DownloadManager.Request(Uri.parse(downloadUrl)).apply {
            setTitle("Mise a jour Organizer")
            setDescription("Telechargement version ${updateInfo.version}")
            setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
            setDestinationInExternalFilesDir(context, Environment.DIRECTORY_DOWNLOADS, fileName)
            setMimeType(APK_MIME_TYPE)
            setAllowedNetworkTypes(
                DownloadManager.Request.NETWORK_WIFI or DownloadManager.Request.NETWORK_MOBILE
            )
        }

        val downloadManager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        currentDownloadId = downloadManager.enqueue(request)

        // Save download state for persistence
        updatePrefs.saveDownloadState(currentDownloadId, updateInfo, fileName)

        // Update StateFlow
        _downloadState.value = UpdateDownloadState(
            status = DownloadStatus.Downloading(0, 0, 0),
            updateInfo = updateInfo,
            downloadId = currentDownloadId
        )

        // Start progress monitoring
        startProgressMonitoring()

        // Register receiver for download completion
        unregisterReceiver()
        downloadReceiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: Intent?) {
                val id = intent?.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1) ?: -1
                if (id == currentDownloadId) {
                    Log.d(TAG, "Download complete, checking status...")
                    handleDownloadComplete(downloadManager, fileName)
                }
            }
        }

        val filter = IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(downloadReceiver, filter, Context.RECEIVER_EXPORTED)
        } else {
            context.registerReceiver(downloadReceiver, filter)
        }
    }

    private fun startProgressMonitoring() {
        progressJob?.cancel()
        progressJob = CoroutineScope(Dispatchers.IO).launch {
            while (isActive) {
                updateProgress()
                delay(500) // Update every 500ms
            }
        }
    }

    private fun updateProgress() {
        val downloadManager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        val query = DownloadManager.Query().setFilterById(currentDownloadId)

        downloadManager.query(query)?.use { cursor ->
            if (cursor.moveToFirst()) {
                val bytesDownloaded = cursor.getLong(
                    cursor.getColumnIndex(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR)
                )
                val bytesTotal = cursor.getLong(
                    cursor.getColumnIndex(DownloadManager.COLUMN_TOTAL_SIZE_BYTES)
                )
                val status = cursor.getInt(
                    cursor.getColumnIndex(DownloadManager.COLUMN_STATUS)
                )

                if (status == DownloadManager.STATUS_RUNNING && bytesTotal > 0) {
                    val progress = ((bytesDownloaded * 100) / bytesTotal).toInt()
                    _downloadState.value = _downloadState.value.copy(
                        status = DownloadStatus.Downloading(progress, bytesTotal, bytesDownloaded)
                    )
                }
            }
        }
    }

    private fun handleDownloadComplete(downloadManager: DownloadManager, fileName: String) {
        progressJob?.cancel()

        val query = DownloadManager.Query().setFilterById(currentDownloadId)
        downloadManager.query(query).use { cursor ->
            if (cursor.moveToFirst()) {
                val statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS)
                val status = cursor.getInt(statusIndex)

                when (status) {
                    DownloadManager.STATUS_SUCCESSFUL -> {
                        Log.d(TAG, "Download successful, verifying...")
                        val file = File(
                            context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),
                            fileName
                        )

                        if (!file.exists()) {
                            _downloadState.value = _downloadState.value.copy(
                                status = DownloadStatus.Error(UpdateError.Unknown("Fichier non trouvé"))
                            )
                            return
                        }

                        // Verify checksum
                        _downloadState.value = _downloadState.value.copy(
                            status = DownloadStatus.Verifying
                        )

                        val expectedChecksum = updatePrefs.getExpectedChecksum()
                        if (expectedChecksum == null) {
                            Log.w(TAG, "No checksum saved, skipping verification")
                            _downloadState.value = _downloadState.value.copy(
                                status = DownloadStatus.ReadyToInstall(file)
                            )
                            return
                        }

                        if (!verifySHA256(file, expectedChecksum)) {
                            // Checksum mismatch - delete file
                            file.delete()
                            updatePrefs.clearDownloadState()
                            _downloadState.value = _downloadState.value.copy(
                                status = DownloadStatus.Error(UpdateError.ChecksumMismatch)
                            )
                            return
                        }

                        // Checksum OK
                        Log.d(TAG, "Checksum verified, ready to install")
                        _downloadState.value = _downloadState.value.copy(
                            status = DownloadStatus.ReadyToInstall(file)
                        )
                    }

                    DownloadManager.STATUS_FAILED -> {
                        val reasonIndex = cursor.getColumnIndex(DownloadManager.COLUMN_REASON)
                        val reason = cursor.getInt(reasonIndex)
                        Log.e(TAG, "Download failed with reason: $reason")

                        val error = when (reason) {
                            DownloadManager.ERROR_INSUFFICIENT_SPACE -> UpdateError.StorageFull
                            DownloadManager.ERROR_CANNOT_RESUME,
                            DownloadManager.ERROR_HTTP_DATA_ERROR,
                            DownloadManager.ERROR_TOO_MANY_REDIRECTS,
                            DownloadManager.ERROR_UNHANDLED_HTTP_CODE -> UpdateError.NetworkError
                            else -> UpdateError.DownloadFailed(reason)
                        }

                        _downloadState.value = _downloadState.value.copy(
                            status = DownloadStatus.Error(error)
                        )
                    }
                }
            }
        }
        unregisterReceiver()
    }

    private fun verifySHA256(file: File, expectedChecksum: String): Boolean {
        try {
            val digest = MessageDigest.getInstance("SHA-256")
            file.inputStream().use { input ->
                val buffer = ByteArray(8192)
                var read = input.read(buffer)
                while (read > 0) {
                    digest.update(buffer, 0, read)
                    read = input.read(buffer)
                }
            }
            val hash = digest.digest().joinToString("") { "%02x".format(it) }
            Log.d(TAG, "Checksum - Expected: $expectedChecksum, Actual: $hash")
            return hash.equals(expectedChecksum, ignoreCase = true)
        } catch (e: Exception) {
            Log.e(TAG, "Error verifying checksum", e)
            return false
        }
    }

    /**
     * Check for pending download on app launch
     */
    fun checkPendingDownload() {
        if (!updatePrefs.hasActiveDownload()) return

        val downloadId = updatePrefs.getDownloadId()
        val fileName = updatePrefs.getFileName() ?: return

        Log.d(TAG, "Found pending download: id=$downloadId, file=$fileName")

        val downloadManager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        val query = DownloadManager.Query().setFilterById(downloadId)

        downloadManager.query(query)?.use { cursor ->
            if (cursor.moveToFirst()) {
                val statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS)
                val status = cursor.getInt(statusIndex)

                when (status) {
                    DownloadManager.STATUS_SUCCESSFUL -> {
                        Log.d(TAG, "Pending download completed, processing...")
                        currentDownloadId = downloadId
                        handleDownloadComplete(downloadManager, fileName)
                    }
                    DownloadManager.STATUS_RUNNING,
                    DownloadManager.STATUS_PENDING,
                    DownloadManager.STATUS_PAUSED -> {
                        Log.d(TAG, "Pending download still in progress")
                        // Reattach observer
                        currentDownloadId = downloadId
                        startProgressMonitoring()

                        // Re-register receiver
                        unregisterReceiver()
                        downloadReceiver = object : BroadcastReceiver() {
                            override fun onReceive(ctx: Context?, intent: Intent?) {
                                val id = intent?.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1)
                                if (id == currentDownloadId) {
                                    handleDownloadComplete(downloadManager, fileName)
                                }
                            }
                        }

                        val filter = IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            context.registerReceiver(downloadReceiver, filter, Context.RECEIVER_EXPORTED)
                        } else {
                            context.registerReceiver(downloadReceiver, filter)
                        }
                    }
                    DownloadManager.STATUS_FAILED -> {
                        Log.d(TAG, "Pending download failed, cleaning up")
                        updatePrefs.clearDownloadState()
                        _downloadState.value = UpdateDownloadState()
                    }
                }
            } else {
                // Download ID not found in DownloadManager, clean up
                Log.w(TAG, "Download ID not found, cleaning up")
                updatePrefs.clearDownloadState()
                _downloadState.value = UpdateDownloadState()
            }
        }
    }

    /**
     * Install APK using FileProvider for Android 7+
     */
    fun installApk(file: File) {
        Log.d(TAG, "Installing APK: ${file.absolutePath}")

        // Clear download state after installation
        updatePrefs.clearDownloadState()
        _downloadState.value = UpdateDownloadState()

        val intent = Intent(Intent.ACTION_VIEW).apply {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                val uri = FileProvider.getUriForFile(
                    context,
                    "${context.packageName}.fileprovider",
                    file
                )
                setDataAndType(uri, APK_MIME_TYPE)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            } else {
                setDataAndType(Uri.fromFile(file), APK_MIME_TYPE)
            }
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }

        context.startActivity(intent)
    }

    /**
     * Cancel ongoing download
     */
    fun cancelDownload() {
        progressJob?.cancel()

        if (currentDownloadId != -1L) {
            val downloadManager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            downloadManager.remove(currentDownloadId)
            currentDownloadId = -1
        }

        // Delete partial APK file if exists
        val fileName = updatePrefs.getFileName()
        if (fileName != null) {
            val file = File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), fileName)
            if (file.exists()) file.delete()
        }

        updatePrefs.clearDownloadState()
        _downloadState.value = UpdateDownloadState()
        unregisterReceiver()
    }

    /**
     * Dismiss the update dialog without canceling/deleting the downloaded file.
     * The file remains on disk for later installation.
     */
    fun dismissDialog() {
        _downloadState.value = UpdateDownloadState()
    }

    /**
     * Retry failed download
     */
    fun retryDownload() {
        val updateInfo = _downloadState.value.updateInfo ?: return
        cancelDownload() // Clean up first
        downloadAndInstall(updateInfo)
    }

    private fun unregisterReceiver() {
        downloadReceiver?.let {
            try {
                context.unregisterReceiver(it)
            } catch (e: Exception) {
                Log.e(TAG, "Error unregistering receiver", e)
            }
            downloadReceiver = null
        }
    }
}
