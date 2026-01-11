package com.organizer.chat.ui.screens.rooms

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.organizer.chat.data.api.ApiClient
import com.organizer.chat.data.model.ApkVersionInfo
import com.organizer.chat.data.model.Room
import com.organizer.chat.data.repository.AuthRepository
import com.organizer.chat.data.repository.RoomRepository
import com.organizer.chat.ui.theme.OnlineGreen
import com.organizer.chat.util.AppPreferences
import com.organizer.chat.util.TokenManager
import java.text.SimpleDateFormat
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RoomsScreen(
    roomRepository: RoomRepository,
    tokenManager: TokenManager,
    authRepository: AuthRepository,
    appPreferences: AppPreferences,
    onRoomClick: (Room) -> Unit,
    onSettingsClick: () -> Unit,
    onLogout: () -> Unit
) {
    RoomsContent(
        roomRepository = roomRepository,
        tokenManager = tokenManager,
        authRepository = authRepository,
        appPreferences = appPreferences,
        onRoomClick = onRoomClick,
        onSettingsClick = onSettingsClick,
        onLogout = onLogout
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RoomsContent(
    roomRepository: RoomRepository,
    tokenManager: TokenManager,
    authRepository: AuthRepository,
    appPreferences: AppPreferences,
    onRoomClick: (Room) -> Unit,
    onSettingsClick: () -> Unit,
    onLogout: () -> Unit
) {
    val viewModel = remember { RoomsViewModel(roomRepository, tokenManager, authRepository) }
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Conversations") },
                actions = {
                    IconButton(onClick = { viewModel.loadRooms() }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Rafraichir")
                    }
                    IconButton(onClick = onSettingsClick) {
                        Icon(Icons.Default.Settings, contentDescription = "Parametres")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    titleContentColor = MaterialTheme.colorScheme.onPrimary,
                    actionIconContentColor = MaterialTheme.colorScheme.onPrimary
                )
            )
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            when {
                uiState.isLoading -> {
                    CircularProgressIndicator(
                        modifier = Modifier.align(Alignment.Center)
                    )
                }

                uiState.errorMessage != null -> {
                    Column(
                        modifier = Modifier.align(Alignment.Center),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(
                            text = uiState.errorMessage!!,
                            color = MaterialTheme.colorScheme.error
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Button(onClick = { viewModel.loadRooms() }) {
                            Text("Reessayer")
                        }
                    }
                }

                uiState.rooms.isEmpty() -> {
                    Text(
                        text = "Aucune conversation",
                        modifier = Modifier.align(Alignment.Center),
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                else -> {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize()
                    ) {
                        items(uiState.rooms, key = { it.id }) { room ->
                            RoomItem(
                                room = room,
                                displayName = viewModel.getRoomDisplayName(room),
                                subtitle = viewModel.getRoomSubtitle(room),
                                onClick = { onRoomClick(room) }
                            )
                        }

                        // Easter egg footer with version history
                        item {
                            val context = LocalContext.current
                            val versionName = try {
                                context.packageManager.getPackageInfo(context.packageName, 0).versionName
                            } catch (e: Exception) {
                                "unknown"
                            }

                            // Fetch version history
                            var versionHistory by remember { mutableStateOf<List<ApkVersionInfo>>(emptyList()) }
                            LaunchedEffect(Unit) {
                                try {
                                    val response = ApiClient.getService().getApkVersions(limit = 5)
                                    versionHistory = response.versions
                                } catch (e: Exception) {
                                    // Silently fail - version history is not critical
                                }
                            }

                            // Get current version info from server
                            val currentVersionInfo = versionHistory.find { it.version == versionName }
                            val currentVersionNotes = currentVersionInfo?.releaseNotes
                            val currentVersionDate = currentVersionInfo?.createdAt?.let { createdAt ->
                                try {
                                    val isoFormatter = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault())
                                    val dateFormatter = SimpleDateFormat("dd MMM yyyy", Locale.FRANCE)
                                    val date = isoFormatter.parse(createdAt.substringBefore("."))
                                    date?.let { dateFormatter.format(it) }
                                } catch (e: Exception) {
                                    null
                                }
                            }

                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(32.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Text(
                                    text = "\uD83D\uDC7B",
                                    fontSize = 64.sp
                                )
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(
                                    text = "Boo! Tu as tout scrollé!",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    textAlign = TextAlign.Center
                                )
                                Text(
                                    text = buildString {
                                        append("v$versionName")
                                        if (!currentVersionDate.isNullOrEmpty()) append(" ($currentVersionDate)")
                                        if (!currentVersionNotes.isNullOrEmpty()) append("\n$currentVersionNotes")
                                    },
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.outline,
                                    textAlign = TextAlign.Center
                                )

                                // Version history section
                                if (versionHistory.isNotEmpty()) {
                                    Spacer(modifier = Modifier.height(24.dp))
                                    HorizontalDivider(
                                        modifier = Modifier.padding(horizontal = 32.dp),
                                        color = MaterialTheme.colorScheme.outlineVariant
                                    )
                                    Spacer(modifier = Modifier.height(16.dp))
                                    Text(
                                        text = "Historique des versions",
                                        style = MaterialTheme.typography.labelMedium,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                    Spacer(modifier = Modifier.height(12.dp))

                                    versionHistory.filter { it.version != versionName }.forEach { version ->
                                        VersionHistoryItem(version = version)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun RoomItem(
    room: Room,
    displayName: String,
    subtitle: String,
    onClick: () -> Unit
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
    ) {
        Row(
            modifier = Modifier
                .padding(16.dp)
                .fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Avatar/Icon
            Surface(
                modifier = Modifier.size(48.dp),
                shape = MaterialTheme.shapes.medium,
                color = when (room.type) {
                    "lobby" -> MaterialTheme.colorScheme.tertiary
                    "public" -> MaterialTheme.colorScheme.secondary
                    else -> MaterialTheme.colorScheme.primary
                }
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = when (room.type) {
                            "lobby" -> Icons.Default.Forum
                            "public" -> Icons.Default.Groups
                            else -> Icons.Default.Person
                        },
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onPrimary
                    )
                }
            }

            Spacer(modifier = Modifier.width(16.dp))

            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = displayName,
                        style = MaterialTheme.typography.titleMedium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )

                    // Online indicator for private rooms
                    if (room.type == "private") {
                        val otherMember = room.members.find { it.userId.isOnline }
                        if (otherMember != null) {
                            Spacer(modifier = Modifier.width(8.dp))
                            Surface(
                                modifier = Modifier.size(8.dp),
                                shape = MaterialTheme.shapes.small,
                                color = OnlineGreen
                            ) {}
                        }
                    }
                }

                Spacer(modifier = Modifier.height(4.dp))

                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }

            Icon(
                imageVector = Icons.Default.ChevronRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }

    HorizontalDivider()
}

@Composable
private fun VersionHistoryItem(version: ApkVersionInfo) {
    val dateFormatter = remember {
        SimpleDateFormat("dd MMM yyyy", Locale.FRANCE)
    }
    val isoFormatter = remember {
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault())
    }

    val formattedDate = try {
        val date = isoFormatter.parse(version.createdAt.substringBefore("."))
        date?.let { dateFormatter.format(it) } ?: ""
    } catch (e: Exception) {
        ""
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = "v${version.version}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        if (formattedDate.isNotEmpty()) {
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = formattedDate,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.outline
            )
        }
    }
    if (version.releaseNotes.isNotEmpty()) {
        Text(
            text = version.releaseNotes,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.outline,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(bottom = 8.dp)
        )
    }
}
