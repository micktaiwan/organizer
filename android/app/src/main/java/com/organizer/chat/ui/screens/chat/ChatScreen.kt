package com.organizer.chat.ui.screens.chat

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.organizer.chat.data.repository.MessageRepository
import com.organizer.chat.service.ChatService
import com.organizer.chat.ui.components.MessageBubble
import com.organizer.chat.util.TokenManager
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    roomId: String,
    roomName: String,
    messageRepository: MessageRepository,
    chatService: ChatService?,
    tokenManager: TokenManager,
    onBackClick: () -> Unit
) {
    val context = LocalContext.current
    val viewModel = remember(roomId, chatService, context) {
        ChatViewModel(roomId, messageRepository, chatService, tokenManager, context)
    }
    val uiState by viewModel.uiState.collectAsState()
    val listState = rememberLazyListState()
    val coroutineScope = rememberCoroutineScope()

    // Permission handling
    var hasAudioPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
                PackageManager.PERMISSION_GRANTED
        )
    }
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        hasAudioPermission = isGranted
    }

    // Notify service that we're in this room
    DisposableEffect(roomId, roomName, chatService) {
        chatService?.setCurrentRoom(roomId, roomName)
        onDispose {
            chatService?.setCurrentRoom(null)
        }
    }

    // Auto-scroll to bottom when new messages arrive
    LaunchedEffect(uiState.messages.size) {
        if (uiState.messages.isNotEmpty()) {
            coroutineScope.launch {
                listState.animateScrollToItem(uiState.messages.size - 1)
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(roomName)
                        if (uiState.typingUsers.isNotEmpty()) {
                            Text(
                                text = "En train d'ecrire...",
                                style = MaterialTheme.typography.bodySmall
                            )
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Retour"
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    titleContentColor = MaterialTheme.colorScheme.onPrimary,
                    navigationIconContentColor = MaterialTheme.colorScheme.onPrimary
                )
            )
        },
        bottomBar = {
            ChatInputBar(
                value = uiState.messageInput,
                onValueChange = viewModel::updateMessageInput,
                onSend = viewModel::sendMessage,
                isSending = uiState.isSending,
                isRecording = uiState.isRecording,
                recordingDuration = uiState.recordingDuration,
                hasAudioPermission = hasAudioPermission,
                onRequestPermission = { permissionLauncher.launch(Manifest.permission.RECORD_AUDIO) },
                onStartRecording = viewModel::startRecording,
                onStopRecording = viewModel::stopRecordingAndSend
            )
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .background(MaterialTheme.colorScheme.background)
        ) {
            when {
                uiState.isLoading && uiState.messages.isEmpty() -> {
                    CircularProgressIndicator(
                        modifier = Modifier.align(Alignment.Center)
                    )
                }

                uiState.errorMessage != null && uiState.messages.isEmpty() -> {
                    Column(
                        modifier = Modifier.align(Alignment.Center),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(
                            text = uiState.errorMessage!!,
                            color = MaterialTheme.colorScheme.error
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Button(onClick = { viewModel.loadMessages() }) {
                            Text("Reessayer")
                        }
                    }
                }

                uiState.messages.isEmpty() -> {
                    Text(
                        text = "Aucun message",
                        modifier = Modifier.align(Alignment.Center),
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                else -> {
                    LazyColumn(
                        state = listState,
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(horizontal = 8.dp),
                        contentPadding = PaddingValues(vertical = 8.dp)
                    ) {
                        items(uiState.messages, key = { it.id }) { message ->
                            MessageBubble(
                                message = message,
                                isMyMessage = viewModel.isMyMessage(message)
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ChatInputBar(
    value: String,
    onValueChange: (String) -> Unit,
    onSend: () -> Unit,
    isSending: Boolean,
    isRecording: Boolean,
    recordingDuration: Int,
    hasAudioPermission: Boolean,
    onRequestPermission: () -> Unit,
    onStartRecording: () -> Boolean,
    onStopRecording: () -> Unit
) {
    val currentOnStartRecording by rememberUpdatedState(onStartRecording)
    val currentOnStopRecording by rememberUpdatedState(onStopRecording)
    val currentHasPermission by rememberUpdatedState(hasAudioPermission)
    val currentIsSending by rememberUpdatedState(isSending)

    val micColor by animateColorAsState(
        targetValue = if (isRecording) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
        label = "micColor"
    )

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shadowElevation = 8.dp
    ) {
        // Always same layout structure to keep pointerInput alive
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (isRecording) {
                // Recording info instead of text field
                Row(
                    modifier = Modifier.weight(1f),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Enregistrement...",
                        color = MaterialTheme.colorScheme.error
                    )
                    Spacer(modifier = Modifier.weight(1f))
                    Text(
                        text = formatDuration(recordingDuration),
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.error
                    )
                }
            } else {
                OutlinedTextField(
                    value = value,
                    onValueChange = onValueChange,
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(24.dp)),
                    placeholder = { Text("Message...") },
                    maxLines = 4,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                    keyboardActions = KeyboardActions(onSend = { onSend() }),
                    enabled = !isSending,
                    shape = RoundedCornerShape(24.dp)
                )
            }

            Spacer(modifier = Modifier.width(8.dp))

            // Mic button - ALWAYS present, same pointerInput
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(CircleShape)
                    .background(micColor.copy(alpha = 0.2f))
                    .pointerInput(Unit) {
                        awaitEachGesture {
                            awaitFirstDown()

                            if (!currentHasPermission) {
                                waitForUpOrCancellation()
                                onRequestPermission()
                                return@awaitEachGesture
                            }

                            if (currentIsSending) {
                                return@awaitEachGesture
                            }

                            // Start recording on press
                            currentOnStartRecording()

                            // Wait for release
                            waitForUpOrCancellation()

                            // Stop and send on release
                            currentOnStopRecording()
                        }
                    },
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Filled.Mic,
                    contentDescription = if (isRecording) "Relacher pour envoyer" else "Maintenir pour enregistrer",
                    tint = micColor
                )
            }

            Spacer(modifier = Modifier.width(4.dp))

            // Send button
            IconButton(
                onClick = onSend,
                enabled = value.isNotBlank() && !isSending && !isRecording
            ) {
                if (isSending) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp),
                        strokeWidth = 2.dp
                    )
                } else {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.Send,
                        contentDescription = "Envoyer",
                        tint = if (value.isNotBlank() && !isRecording) {
                            MaterialTheme.colorScheme.primary
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        }
                    )
                }
            }
        }
    }
}

private fun formatDuration(seconds: Int): String {
    val mins = seconds / 60
    val secs = seconds % 60
    return "%d:%02d".format(mins, secs)
}
