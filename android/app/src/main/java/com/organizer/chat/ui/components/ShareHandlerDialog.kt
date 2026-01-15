package com.organizer.chat.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Message
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.organizer.chat.data.model.Room
import com.organizer.chat.data.model.SharedContent
import com.organizer.chat.ui.theme.AccentBlue
import com.organizer.chat.ui.theme.Charcoal
import com.organizer.chat.ui.theme.CharcoalLight
import kotlinx.coroutines.launch

@Composable
fun ShareHandlerDialog(
    sharedContent: SharedContent,
    rooms: List<Room>,
    onRoomSelected: (Room) -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Partager vers...")
                IconButton(onClick = onDismiss) {
                    Icon(Icons.Default.Close, contentDescription = "Fermer")
                }
            }
        },
        text = {
            Column {
                // Show preview of shared content
                when (sharedContent) {
                    is SharedContent.Text -> {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(CharcoalLight, MaterialTheme.shapes.small)
                                .padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                Icons.Default.Message,
                                contentDescription = null,
                                tint = AccentBlue,
                                modifier = Modifier.size(24.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = sharedContent.text,
                                style = MaterialTheme.typography.bodyMedium,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                    is SharedContent.SingleImage -> {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(CharcoalLight, MaterialTheme.shapes.small)
                                .padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                Icons.Default.Image,
                                contentDescription = null,
                                tint = AccentBlue,
                                modifier = Modifier.size(24.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "1 image",
                                style = MaterialTheme.typography.bodyMedium
                            )
                        }
                    }
                    is SharedContent.MultipleImages -> {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(CharcoalLight, MaterialTheme.shapes.small)
                                .padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                Icons.Default.Image,
                                contentDescription = null,
                                tint = AccentBlue,
                                modifier = Modifier.size(24.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "${sharedContent.uris.size} images",
                                style = MaterialTheme.typography.bodyMedium
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Room list
                Text(
                    text = "Sélectionner un salon",
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                Spacer(modifier = Modifier.height(8.dp))

                if (rooms.isEmpty()) {
                    Text(
                        text = "Aucun salon disponible",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(16.dp)
                    )
                } else {
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(300.dp)
                    ) {
                        items(rooms) { room ->
                            RoomItem(
                                room = room,
                                onClick = { onRoomSelected(room) }
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = {}
    )
}

@Composable
private fun RoomItem(
    room: Room,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 8.dp, horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(AccentBlue.copy(alpha = 0.2f)),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                Icons.Default.Group,
                contentDescription = null,
                tint = AccentBlue,
                modifier = Modifier.size(24.dp)
            )
        }

        Spacer(modifier = Modifier.width(12.dp))

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = room.name,
                style = MaterialTheme.typography.bodyLarge,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = "${room.members.size} membres",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
