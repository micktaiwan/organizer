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
import com.organizer.chat.data.socket.ConnectionState
import com.organizer.chat.service.ChatService
import com.organizer.chat.ui.components.ConnectionStatusIcon
import com.organizer.chat.ui.components.CreateRoomDialog
import com.organizer.chat.ui.components.OfflineBanner
import com.organizer.chat.ui.theme.CharcoalLight
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
    chatService: ChatService?,
    onRoomClick: (Room) -> Unit,
    onSettingsClick: () -> Unit,
    onLogout: () -> Unit
) {
    RoomsContent(
        roomRepository = roomRepository,
        tokenManager = tokenManager,
        authRepository = authRepository,
        appPreferences = appPreferences,
        chatService = chatService,
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
    chatService: ChatService?,
    onRoomClick: (Room) -> Unit,
    onSettingsClick: () -> Unit,
    onLogout: () -> Unit
) {
    val viewModel = remember { RoomsViewModel(roomRepository, tokenManager, authRepository) }
    val uiState by viewModel.uiState.collectAsState()

    // Connection state - use current state as initial to avoid flicker
    val initialConnectionState = remember {
        if (chatService?.socketManager?.isConnected() == true) ConnectionState.Connected
        else ConnectionState.Disconnected
    }
    val connectionState by chatService?.socketManager?.connectionState
        ?.collectAsState(initial = initialConnectionState)
        ?: remember { mutableStateOf(initialConnectionState) }

    // Observe new messages to refresh room list (for updated sorting)
    LaunchedEffect(chatService) {
        chatService?.messages?.collect { _ ->
            viewModel.loadRooms()
        }
    }

    // Observe room:created to refresh room list
    LaunchedEffect(chatService) {
        chatService?.roomCreated?.collect { event ->
            android.util.Log.d("RoomsScreen", "Room created event received: ${event.roomName}")
            viewModel.loadRooms()
        }
    }

    // Observe room:updated to refresh room list (e.g., when member count changes)
    LaunchedEffect(chatService) {
        chatService?.roomUpdated?.collect { event ->
            android.util.Log.d("RoomsScreen", "Room updated event received: ${event.roomName}")
            viewModel.loadRooms()
        }
    }

    // Observe room:deleted to refresh room list
    LaunchedEffect(chatService) {
        chatService?.roomDeleted?.collect { event ->
            android.util.Log.d("RoomsScreen", "Room deleted event received: ${event.roomName}")
            viewModel.loadRooms()
        }
    }

    // Observe unread:updated to refresh room list (updates unread count badges)
    LaunchedEffect(chatService) {
        chatService?.unreadUpdated?.collect { event ->
            android.util.Log.d("RoomsScreen", "Unread updated: room=${event.roomId}, count=${event.unreadCount}")
            viewModel.loadRooms()
        }
    }

    // Rooms are already sorted by lastMessageAt from the server
    val sortedRooms = uiState.rooms

    // Handle navigation after room creation
    LaunchedEffect(uiState.createdRoom) {
        uiState.createdRoom?.let { room ->
            onRoomClick(room)
            viewModel.clearCreatedRoom()
        }
    }

    // Show create room dialog
    if (uiState.showCreateRoomDialog) {
        CreateRoomDialog(
            isLoading = uiState.isCreatingRoom,
            errorMessage = uiState.createRoomError,
            onDismiss = { viewModel.hideCreateRoomDialog() },
            onCreate = { name -> viewModel.createRoom(name) }
        )
    }

    Scaffold(
        topBar = {
            Column {
                TopAppBar(
                    title = { Text("Conversations") },
                    actions = {
                        ConnectionStatusIcon(
                            connectionState = connectionState,
                            modifier = Modifier.padding(end = 4.dp)
                        )
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
                OfflineBanner(
                    connectionState = connectionState,
                    onRetry = { chatService?.reconnectIfNeeded() }
                )
            }
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = { viewModel.showCreateRoomDialog() },
                containerColor = MaterialTheme.colorScheme.primary
            ) {
                Icon(Icons.Default.Add, contentDescription = "Nouveau salon")
            }
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

                sortedRooms.isEmpty() -> {
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
                        items(sortedRooms, key = { it.id }) { room ->
                            RoomItem(
                                room = room,
                                displayName = viewModel.getRoomDisplayName(room),
                                subtitle = viewModel.getRoomSubtitle(room),
                                isMember = viewModel.isMember(room),
                                canLeave = viewModel.canLeaveRoom(room),
                                unreadCount = room.unreadCount,
                                onClick = { onRoomClick(room) },
                                onLeaveRoom = { viewModel.leaveRoom(room.id) }
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
                                Surface(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(horizontal = 16.dp),
                                    shape = MaterialTheme.shapes.medium,
                                    color = CharcoalLight
                                ) {
                                    Column(
                                        modifier = Modifier.padding(16.dp),
                                        horizontalAlignment = Alignment.CenterHorizontally
                                    ) {
                                        Text(
                                            text = "Version actuelle",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                        Spacer(modifier = Modifier.height(4.dp))
                                        Text(
                                            text = "v$versionName",
                                            style = MaterialTheme.typography.bodyMedium,
                                            color = MaterialTheme.colorScheme.onSurface
                                        )
                                        if (!currentVersionDate.isNullOrEmpty()) {
                                            Text(
                                                text = currentVersionDate,
                                                style = MaterialTheme.typography.bodySmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant
                                            )
                                        }
                                        if (!currentVersionNotes.isNullOrEmpty()) {
                                            Spacer(modifier = Modifier.height(8.dp))
                                            Text(
                                                text = currentVersionNotes,
                                                style = MaterialTheme.typography.bodySmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                textAlign = TextAlign.Center
                                            )
                                        }
                                    }
                                }

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
    isMember: Boolean,
    canLeave: Boolean,
    unreadCount: Int,
    onClick: () -> Unit,
    onLeaveRoom: () -> Unit
) {
    // Use dimmed colors for non-member rooms
    val iconColor = if (isMember) {
        when (room.type) {
            "lobby" -> MaterialTheme.colorScheme.tertiary
            "public" -> MaterialTheme.colorScheme.secondary
            else -> MaterialTheme.colorScheme.primary
        }
    } else {
        MaterialTheme.colorScheme.outlineVariant
    }

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
                color = iconColor
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = when (room.type) {
                            "lobby" -> Icons.Default.Forum
                            "public" -> Icons.Default.Groups
                            else -> Icons.Default.Person
                        },
                        contentDescription = null,
                        tint = if (isMember) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.outline
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

            // Unread count badge
            if (unreadCount > 0) {
                Badge(
                    containerColor = MaterialTheme.colorScheme.error,
                    contentColor = MaterialTheme.colorScheme.onError
                ) {
                    Text(
                        text = if (unreadCount > 99) "99+" else unreadCount.toString(),
                        style = MaterialTheme.typography.labelSmall
                    )
                }
                Spacer(modifier = Modifier.width(8.dp))
            }

            // Leave button (only for non-lobby rooms where user is member)
            if (canLeave) {
                IconButton(
                    onClick = onLeaveRoom,
                    modifier = Modifier.size(40.dp)
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.Logout,
                        contentDescription = "Quitter le salon",
                        tint = MaterialTheme.colorScheme.error.copy(alpha = 0.7f)
                    )
                }
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
