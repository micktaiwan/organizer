package com.organizer.chat.ui.screens.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.organizer.chat.data.model.DownloadStatus
import com.organizer.chat.data.model.UpdateCheckResult
import com.organizer.chat.data.repository.UpdateRepository
import com.organizer.chat.util.UpdateManager
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    onBackClick: () -> Unit,
    onLogout: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    val updateRepository = remember { UpdateRepository(context) }
    val updateManager = remember { UpdateManager(context) }

    // Observer for download state
    val downloadState by updateManager.downloadState.collectAsState()

    var isCheckingUpdate by remember { mutableStateOf(false) }
    var updateResult by remember { mutableStateOf<UpdateCheckResult?>(null) }

    val currentVersion = remember { updateRepository.getCurrentVersionName() }

    fun checkForUpdate() {
        scope.launch {
            isCheckingUpdate = true
            updateRepository.checkForUpdate().fold(
                onSuccess = { result ->
                    updateResult = result
                    // If update available and user explicitly checked, start download immediately
                    if (result.updateAvailable && result.updateInfo != null) {
                        updateManager.downloadAndInstall(result.updateInfo)
                    }
                },
                onFailure = { /* Handle error silently */ }
            )
            isCheckingUpdate = false
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Parametres") },
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Retour")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    titleContentColor = MaterialTheme.colorScheme.onPrimary,
                    navigationIconContentColor = MaterialTheme.colorScheme.onPrimary
                ),
                windowInsets = WindowInsets.statusBars
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            // Version & Update section
            ListItem(
                headlineContent = { Text("Version de l'application") },
                supportingContent = { Text("Version $currentVersion") },
                leadingContent = {
                    Icon(Icons.Default.Info, contentDescription = null)
                }
            )

            ListItem(
                headlineContent = { Text("Verifier les mises a jour") },
                supportingContent = {
                    when (val status = downloadState.status) {
                        is DownloadStatus.Downloading -> {
                            Text("Telechargement en cours: ${status.progress}%")
                        }
                        is DownloadStatus.Verifying -> {
                            Text("Verification du fichier...")
                        }
                        is DownloadStatus.ReadyToInstall -> {
                            Text("Mise a jour prete a installer")
                        }
                        is DownloadStatus.Error -> {
                            Text(
                                text = status.error.userMessage,
                                color = MaterialTheme.colorScheme.error
                            )
                        }
                        is DownloadStatus.Idle -> {
                            when {
                                isCheckingUpdate -> Text("Verification...")
                                updateResult?.updateAvailable == false ->
                                    Text("Vous avez la derniere version")
                                else -> Text("Appuyez pour verifier")
                            }
                        }
                    }
                },
                leadingContent = {
                    Icon(Icons.Default.SystemUpdate, contentDescription = null)
                },
                trailingContent = {
                    when (val status = downloadState.status) {
                        is DownloadStatus.Downloading,
                        is DownloadStatus.Verifying -> {
                            CircularProgressIndicator(
                                modifier = Modifier.size(24.dp),
                                strokeWidth = 2.dp
                            )
                        }
                        else -> {
                            if (isCheckingUpdate) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(24.dp),
                                    strokeWidth = 2.dp
                                )
                            }
                        }
                    }
                },
                modifier = Modifier.clickable(
                    enabled = !isCheckingUpdate && downloadState.status is DownloadStatus.Idle
                ) {
                    checkForUpdate()
                }
            )

            // Cancel button when download in progress
            when (val status = downloadState.status) {
                is DownloadStatus.Downloading,
                is DownloadStatus.Verifying -> {
                    ListItem(
                        headlineContent = { Text("Annuler le telechargement") },
                        leadingContent = {
                            Icon(
                                Icons.Default.Cancel,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.error
                            )
                        },
                        modifier = Modifier.clickable { updateManager.cancelDownload() }
                    )
                }
                is DownloadStatus.Error -> {
                    // Retry button if error is retryable
                    if (status.error.canRetry) {
                        ListItem(
                            headlineContent = { Text("Reessayer le telechargement") },
                            leadingContent = {
                                Icon(Icons.Default.Refresh, contentDescription = null)
                            },
                            modifier = Modifier.clickable { updateManager.retryDownload() }
                        )
                    }
                }
                is DownloadStatus.ReadyToInstall -> {
                    // Install button when ready
                    ListItem(
                        headlineContent = { Text("Installer maintenant") },
                        leadingContent = {
                            Icon(
                                Icons.Default.Download,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary
                            )
                        },
                        modifier = Modifier.clickable {
                            updateManager.installApk(status.file)
                        }
                    )
                }
                else -> {}
            }

            HorizontalDivider()

            // Logout
            ListItem(
                headlineContent = { Text("Deconnexion") },
                leadingContent = {
                    Icon(
                        Icons.AutoMirrored.Filled.Logout,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.error
                    )
                },
                modifier = Modifier.clickable { onLogout() }
            )
        }
    }

}
