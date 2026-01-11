package com.organizer.chat.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.organizer.chat.ui.theme.AccentBlue

@Composable
fun CreateRoomDialog(
    isLoading: Boolean,
    errorMessage: String?,
    onDismiss: () -> Unit,
    onCreate: (String) -> Unit
) {
    var roomName by remember { mutableStateOf("") }
    val focusRequester = remember { FocusRequester() }

    // Auto-focus on text field
    LaunchedEffect(Unit) {
        focusRequester.requestFocus()
    }

    AlertDialog(
        onDismissRequest = { if (!isLoading) onDismiss() },
        title = {
            Text("Nouveau salon public")
        },
        text = {
            Column {
                OutlinedTextField(
                    value = roomName,
                    onValueChange = { roomName = it },
                    label = { Text("Nom du salon") },
                    placeholder = { Text("Ex: Discussion generale") },
                    singleLine = true,
                    enabled = !isLoading,
                    isError = errorMessage != null,
                    supportingText = if (errorMessage != null) {
                        { Text(errorMessage, color = MaterialTheme.colorScheme.error) }
                    } else {
                        { Text("${roomName.length}/100") }
                    },
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(
                        onDone = { if (roomName.isNotBlank() && !isLoading) onCreate(roomName) }
                    ),
                    colors = OutlinedTextFieldDefaults.colors(
                        cursorColor = AccentBlue,
                        focusedBorderColor = AccentBlue,
                        unfocusedBorderColor = AccentBlue.copy(alpha = 0.5f)
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .focusRequester(focusRequester)
                )

                if (isLoading) {
                    Spacer(modifier = Modifier.height(16.dp))
                    LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onCreate(roomName) },
                enabled = roomName.isNotBlank() && !isLoading,
                colors = ButtonDefaults.textButtonColors(
                    contentColor = AccentBlue,
                    disabledContentColor = AccentBlue.copy(alpha = 0.38f)
                )
            ) {
                Text("Creer")
            }
        },
        dismissButton = {
            TextButton(
                onClick = onDismiss,
                enabled = !isLoading,
                colors = ButtonDefaults.textButtonColors(
                    contentColor = AccentBlue,
                    disabledContentColor = AccentBlue.copy(alpha = 0.38f)
                )
            ) {
                Text("Annuler")
            }
        }
    )
}
