package com.organizer.chat.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.SystemUpdate
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.organizer.chat.data.model.AppUpdateInfo
import com.organizer.chat.util.UpdateManager

@Composable
fun UpdateDialog(
    updateInfo: AppUpdateInfo,
    downloadState: UpdateManager.DownloadState,
    onDownload: () -> Unit,
    onInstall: () -> Unit,
    onDismiss: () -> Unit
) {
    Dialog(onDismissRequest = onDismiss) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            shape = MaterialTheme.shapes.large
        ) {
            Column(
                modifier = Modifier.padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Icon(
                    imageVector = Icons.Default.SystemUpdate,
                    contentDescription = null,
                    modifier = Modifier.size(48.dp),
                    tint = MaterialTheme.colorScheme.primary
                )

                Spacer(modifier = Modifier.height(16.dp))

                Text(
                    text = "Mise a jour disponible",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold
                )

                Spacer(modifier = Modifier.height(8.dp))

                Text(
                    text = "Version ${updateInfo.version}",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.primary
                )

                Spacer(modifier = Modifier.height(16.dp))

                // Release notes
                if (updateInfo.releaseNotes.isNotBlank()) {
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        color = MaterialTheme.colorScheme.surfaceVariant,
                        shape = MaterialTheme.shapes.medium
                    ) {
                        Text(
                            text = updateInfo.releaseNotes,
                            modifier = Modifier.padding(12.dp),
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                    Spacer(modifier = Modifier.height(16.dp))
                }

                // File size
                val sizeInMb = updateInfo.fileSize / (1024.0 * 1024.0)
                Text(
                    text = "Taille: %.1f MB".format(sizeInMb),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                Spacer(modifier = Modifier.height(24.dp))

                // Download state UI
                when (downloadState) {
                    is UpdateManager.DownloadState.Idle -> {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            OutlinedButton(
                                onClick = onDismiss,
                                modifier = Modifier.weight(1f)
                            ) {
                                Text("Plus tard")
                            }
                            Button(
                                onClick = onDownload,
                                modifier = Modifier.weight(1f)
                            ) {
                                Text("Telecharger")
                            }
                        }
                    }

                    is UpdateManager.DownloadState.Downloading -> {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            LinearProgressIndicator(
                                modifier = Modifier.fillMaxWidth()
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = "Telechargement en cours...",
                                style = MaterialTheme.typography.bodySmall
                            )
                        }
                    }

                    is UpdateManager.DownloadState.Completed -> {
                        Button(
                            onClick = onInstall,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text("Installer")
                        }
                    }

                    is UpdateManager.DownloadState.Failed -> {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text(
                                text = "Echec du telechargement",
                                color = MaterialTheme.colorScheme.error,
                                style = MaterialTheme.typography.bodyMedium
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Button(onClick = onDownload) {
                                Text("Reessayer")
                            }
                        }
                    }
                }
            }
        }
    }
}
