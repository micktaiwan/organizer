package com.organizer.chat.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.organizer.chat.data.model.DownloadStatus
import com.organizer.chat.data.model.UpdateDownloadState
import java.io.File

@Composable
fun UpdateProgressDialog(
    state: UpdateDownloadState,
    onCancel: () -> Unit,
    onRetry: () -> Unit,
    onInstall: (File) -> Unit,
    onDismiss: () -> Unit
) {
    if (state.status is DownloadStatus.Idle) return

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                when (state.status) {
                    is DownloadStatus.Downloading -> "Téléchargement en cours"
                    is DownloadStatus.Verifying -> "Vérification"
                    is DownloadStatus.ReadyToInstall -> "Mise à jour prête"
                    is DownloadStatus.Error -> "Erreur"
                    else -> "Mise à jour"
                }
            )
        },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                when (val status = state.status) {
                    is DownloadStatus.Downloading -> {
                        Text(
                            text = "Version ${state.updateInfo?.version}",
                            style = MaterialTheme.typography.titleMedium
                        )
                        Spacer(modifier = Modifier.height(16.dp))

                        LinearProgressIndicator(
                            progress = { status.progress / 100f },
                            modifier = Modifier.fillMaxWidth()
                        )

                        Spacer(modifier = Modifier.height(8.dp))

                        Text(
                            text = "${status.progress}% (${formatBytes(status.downloadedBytes)} / ${formatBytes(status.totalBytes)})",
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }

                    is DownloadStatus.Verifying -> {
                        CircularProgressIndicator()
                        Spacer(modifier = Modifier.height(16.dp))
                        Text("Vérification de l'intégrité du fichier...")
                    }

                    is DownloadStatus.ReadyToInstall -> {
                        Text(
                            text = "Version ${state.updateInfo?.version} prête à être installée",
                            style = MaterialTheme.typography.bodyMedium
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = state.updateInfo?.releaseNotes ?: "",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }

                    is DownloadStatus.Error -> {
                        Text(
                            text = status.error.userMessage,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.error
                        )
                    }

                    else -> {}
                }
            }
        },
        confirmButton = {
            when (val status = state.status) {
                is DownloadStatus.ReadyToInstall -> {
                    TextButton(onClick = { onInstall(status.file) }) {
                        Text("Installer")
                    }
                }
                is DownloadStatus.Error -> {
                    if (status.error.canRetry) {
                        TextButton(onClick = onRetry) {
                            Text("Réessayer")
                        }
                    }
                }
                else -> {}
            }
        },
        dismissButton = {
            when (state.status) {
                is DownloadStatus.Downloading,
                is DownloadStatus.Error -> {
                    TextButton(onClick = onCancel) {
                        Text("Annuler")
                    }
                }
                is DownloadStatus.ReadyToInstall -> {
                    TextButton(onClick = onDismiss) {
                        Text("Plus tard")
                    }
                }
                else -> {}
            }
        }
    )
}

private fun formatBytes(bytes: Long): String {
    return when {
        bytes < 1024 -> "$bytes B"
        bytes < 1024 * 1024 -> "${bytes / 1024} KB"
        else -> String.format("%.1f MB", bytes / (1024.0 * 1024.0))
    }
}
