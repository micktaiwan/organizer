package com.organizer.chat.ui.components

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import com.organizer.chat.ui.theme.AccentBlue
import com.organizer.chat.ui.theme.OnlineGreen

@Composable
fun IncomingCallDialog(
    callerName: String,
    withCamera: Boolean,
    onAccept: () -> Unit,
    onReject: () -> Unit
) {
    AlertDialog(
        onDismissRequest = { /* Do not dismiss on outside tap */ },
        title = {
            Text("Appel entrant")
        },
        text = {
            Text(
                text = if (withCamera) {
                    "$callerName vous appelle en video"
                } else {
                    "$callerName vous appelle"
                }
            )
        },
        confirmButton = {
            TextButton(
                onClick = onAccept,
                colors = ButtonDefaults.textButtonColors(contentColor = OnlineGreen)
            ) {
                Text("Accepter")
            }
        },
        dismissButton = {
            TextButton(
                onClick = onReject,
                colors = ButtonDefaults.textButtonColors(contentColor = AccentBlue)
            ) {
                Text("Refuser")
            }
        }
    )
}
