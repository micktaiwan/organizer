package com.organizer.chat.ui.screens.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.organizer.chat.data.model.UpdateCheckResult
import com.organizer.chat.data.repository.UpdateRepository
import com.organizer.chat.ui.components.UpdateDialog
import com.organizer.chat.util.UpdateManager
import kotlinx.coroutines.launch
import java.io.File

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

    var isCheckingUpdate by remember { mutableStateOf(false) }
    var updateResult by remember { mutableStateOf<UpdateCheckResult?>(null) }
    var showUpdateDialog by remember { mutableStateOf(false) }
    var downloadState by remember { mutableStateOf<UpdateManager.DownloadState>(UpdateManager.DownloadState.Idle) }
    var downloadedFile by remember { mutableStateOf<File?>(null) }

    val currentVersion = remember { updateRepository.getCurrentVersionName() }

    fun checkForUpdate() {
        scope.launch {
            isCheckingUpdate = true
            updateRepository.checkForUpdate().fold(
                onSuccess = { result ->
                    updateResult = result
                    if (result.updateAvailable) {
                        showUpdateDialog = true
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
                )
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
                    when {
                        isCheckingUpdate -> Text("Verification...")
                        updateResult?.updateAvailable == true ->
                            Text("Version ${updateResult?.updateInfo?.version} disponible")
                        updateResult?.updateAvailable == false ->
                            Text("Vous avez la derniere version")
                        else -> Text("Appuyez pour verifier")
                    }
                },
                leadingContent = {
                    Icon(Icons.Default.SystemUpdate, contentDescription = null)
                },
                trailingContent = {
                    if (isCheckingUpdate) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(24.dp),
                            strokeWidth = 2.dp
                        )
                    } else if (updateResult?.updateAvailable == true) {
                        Badge { Text("1") }
                    }
                },
                modifier = Modifier.clickable(enabled = !isCheckingUpdate) {
                    if (updateResult?.updateAvailable == true) {
                        showUpdateDialog = true
                    } else {
                        checkForUpdate()
                    }
                }
            )

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

    // Update dialog
    if (showUpdateDialog && updateResult?.updateInfo != null) {
        UpdateDialog(
            updateInfo = updateResult!!.updateInfo!!,
            downloadState = downloadState,
            onDownload = {
                scope.launch {
                    updateManager.downloadApk(updateResult!!.updateInfo!!)
                        .collect { state ->
                            downloadState = state
                            if (state is UpdateManager.DownloadState.Completed) {
                                downloadedFile = state.file
                            }
                        }
                }
            },
            onInstall = {
                downloadedFile?.let { file ->
                    updateManager.installApk(file)
                }
            },
            onDismiss = {
                showUpdateDialog = false
                downloadState = UpdateManager.DownloadState.Idle
            }
        )
    }
}
