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
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import java.io.File

class UpdateManager(private val context: Context) {

    companion object {
        private const val TAG = "UpdateManager"
        private const val BASE_URL = "http://51.210.150.25:3001"
        private const val APK_MIME_TYPE = "application/vnd.android.package-archive"
    }

    sealed class DownloadState {
        object Idle : DownloadState()
        data class Downloading(val progress: Int) : DownloadState()
        data class Completed(val file: File) : DownloadState()
        data class Failed(val error: String) : DownloadState()
    }

    private var currentDownloadId: Long = -1

    /**
     * Download APK using DownloadManager
     * Returns a Flow that emits download progress and completion status
     */
    fun downloadApk(updateInfo: AppUpdateInfo): Flow<DownloadState> = callbackFlow {
        val downloadUrl = "$BASE_URL${updateInfo.downloadUrl}"
        val fileName = "organizer-${updateInfo.version}.apk"

        Log.d(TAG, "Starting download: $downloadUrl")

        // Create download request
        val request = DownloadManager.Request(Uri.parse(downloadUrl)).apply {
            setTitle("Organizer Update")
            setDescription("Downloading version ${updateInfo.version}")
            setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            setDestinationInExternalFilesDir(context, Environment.DIRECTORY_DOWNLOADS, fileName)
            setMimeType(APK_MIME_TYPE)

            // Allow download over any network type
            setAllowedNetworkTypes(
                DownloadManager.Request.NETWORK_WIFI or
                DownloadManager.Request.NETWORK_MOBILE
            )
        }

        val downloadManager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        currentDownloadId = downloadManager.enqueue(request)

        // Register receiver for download completion
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: Intent?) {
                val id = intent?.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1) ?: -1
                if (id == currentDownloadId) {
                    val query = DownloadManager.Query().setFilterById(currentDownloadId)
                    downloadManager.query(query).use { cursor ->
                        if (cursor.moveToFirst()) {
                            val statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS)
                            val status = cursor.getInt(statusIndex)

                            when (status) {
                                DownloadManager.STATUS_SUCCESSFUL -> {
                                    val localUriIndex = cursor.getColumnIndex(DownloadManager.COLUMN_LOCAL_URI)
                                    val localUri = cursor.getString(localUriIndex)
                                    val file = File(Uri.parse(localUri).path!!)
                                    trySend(DownloadState.Completed(file))
                                }
                                DownloadManager.STATUS_FAILED -> {
                                    val reasonIndex = cursor.getColumnIndex(DownloadManager.COLUMN_REASON)
                                    val reason = cursor.getInt(reasonIndex)
                                    trySend(DownloadState.Failed("Download failed: $reason"))
                                }
                            }
                        }
                    }
                    close()
                }
            }
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(
                receiver,
                IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
                Context.RECEIVER_NOT_EXPORTED
            )
        } else {
            context.registerReceiver(
                receiver,
                IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
            )
        }

        trySend(DownloadState.Downloading(0))

        awaitClose {
            try {
                context.unregisterReceiver(receiver)
            } catch (e: Exception) {
                Log.e(TAG, "Error unregistering receiver", e)
            }
        }
    }

    /**
     * Install APK using FileProvider for Android 7+
     */
    fun installApk(file: File) {
        Log.d(TAG, "Installing APK: ${file.absolutePath}")

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
        if (currentDownloadId != -1L) {
            val downloadManager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            downloadManager.remove(currentDownloadId)
            currentDownloadId = -1
        }
    }
}
