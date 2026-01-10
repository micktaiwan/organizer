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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.organizer.chat.data.model.Room
import com.organizer.chat.data.repository.AuthRepository
import com.organizer.chat.data.repository.RoomRepository
import com.organizer.chat.ui.theme.OnlineGreen
import com.organizer.chat.util.TokenManager

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RoomsScreen(
    roomRepository: RoomRepository,
    tokenManager: TokenManager,
    authRepository: AuthRepository,
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
