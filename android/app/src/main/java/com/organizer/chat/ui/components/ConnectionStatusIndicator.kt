package com.organizer.chat.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Cloud
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.organizer.chat.data.socket.ConnectionState
import com.organizer.chat.ui.theme.OfflineGray
import com.organizer.chat.ui.theme.OnlineGreen

/**
 * Small icon indicator for TopBar
 */
@Composable
fun ConnectionStatusIcon(
    connectionState: ConnectionState,
    modifier: Modifier = Modifier
) {
    val (icon, tint) = when (connectionState) {
        is ConnectionState.Connected -> Icons.Default.Cloud to OnlineGreen
        is ConnectionState.Disconnected -> Icons.Default.CloudOff to OfflineGray
        is ConnectionState.Error -> Icons.Default.CloudOff to Color(0xFFE53935)
    }

    Icon(
        imageVector = icon,
        contentDescription = when (connectionState) {
            is ConnectionState.Connected -> "Connecte"
            is ConnectionState.Disconnected -> "Deconnecte"
            is ConnectionState.Error -> "Erreur de connexion"
        },
        tint = tint,
        modifier = modifier.size(20.dp)
    )
}

/**
 * Full-width banner shown when disconnected
 */
@Composable
fun OfflineBanner(
    connectionState: ConnectionState,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier
) {
    if (connectionState is ConnectionState.Connected) return

    val backgroundColor = when (connectionState) {
        is ConnectionState.Error -> Color(0xFFE53935)
        else -> OfflineGray
    }

    val message = when (connectionState) {
        is ConnectionState.Disconnected -> "Mode hors ligne"
        is ConnectionState.Error -> "Erreur de connexion"
        else -> ""
    }

    Surface(
        modifier = modifier.fillMaxWidth(),
        color = backgroundColor
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = Icons.Default.CloudOff,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(18.dp)
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = message,
                color = Color.White,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.weight(1f)
            )
            TextButton(
                onClick = onRetry,
                colors = ButtonDefaults.textButtonColors(contentColor = Color.White)
            ) {
                Text("Reconnecter")
            }
        }
    }
}
