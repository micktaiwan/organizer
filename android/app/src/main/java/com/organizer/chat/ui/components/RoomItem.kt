package com.organizer.chat.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.organizer.chat.data.model.Room
import com.organizer.chat.ui.theme.OnlineGreen

@Composable
fun RoomListItem(
    room: Room,
    currentUserId: String?,
    onClick: () -> Unit
) {
    val displayName = when {
        room.type == "private" && currentUserId != null -> {
            val otherMember = room.members.find { it.userId.id != currentUserId }
            otherMember?.userId?.displayName ?: room.name
        }
        else -> room.name
    }

    val subtitle = when (room.type) {
        "lobby" -> "Lobby"
        "public" -> "${room.members.size} membres"
        "private" -> "Conversation privee"
        else -> ""
    }

    val icon = when (room.type) {
        "lobby" -> Icons.Default.Forum
        "public" -> Icons.Default.Groups
        else -> Icons.Default.Person
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
            Surface(
                modifier = Modifier.size(48.dp),
                shape = MaterialTheme.shapes.medium,
                color = MaterialTheme.colorScheme.primary
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = icon,
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

                    if (room.type == "private") {
                        val isOtherOnline = room.members.any {
                            it.userId.id != currentUserId && it.userId.isOnline
                        }
                        if (isOtherOnline) {
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
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            Icon(
                imageVector = Icons.Default.ChevronRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
