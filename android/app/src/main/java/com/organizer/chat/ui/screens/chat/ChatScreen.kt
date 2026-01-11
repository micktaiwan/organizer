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
import kotlinx.coroutines.delay
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Mic
import android.net.Uri
import coil.compose.AsyncImage
import androidx.compose.ui.layout.ContentScale
import com.organizer.chat.ui.theme.CharcoalLight
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
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts.PickVisualMedia
import com.organizer.chat.data.repository.MessageRepository
import com.organizer.chat.data.repository.RoomRepository
import com.organizer.chat.ui.theme.AccentBlue
import com.organizer.chat.service.ChatService
import com.organizer.chat.ui.components.MessageBubble
import com.organizer.chat.util.TokenManager
import com.organizer.chat.util.rememberImagePickerLaunchers
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    roomId: String,
    roomName: String,
    messageRepository: MessageRepository,
    roomRepository: RoomRepository,
    chatService: ChatService?,
    tokenManager: TokenManager,
    onBackClick: () -> Unit
) {
    val context = LocalContext.current
    val viewModel = remember(roomId, chatService, context) {
        ChatViewModel(roomId, messageRepository, roomRepository, chatService, tokenManager, context)
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
    val audioPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        hasAudioPermission = isGranted
    }

    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED
        )
    }
    val cameraPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        hasCameraPermission = isGranted
    }

    var hasGalleryPermission by remember {
        mutableStateOf(
            android.os.Build.VERSION.SDK_INT >= 33 ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.READ_EXTERNAL_STORAGE) ==
                PackageManager.PERMISSION_GRANTED
        )
    }
    val galleryPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        hasGalleryPermission = isGranted
    }

    // Image picker launchers
    val imagePickers = rememberImagePickerLaunchers(
        onImageCaptured = { uri -> viewModel.selectImage(uri) },
        onImageSelected = { uri -> viewModel.selectImage(uri) }
    )

    // Notify service that we're in this room
    DisposableEffect(roomId, roomName, chatService) {
        chatService?.setCurrentRoom(roomId, roomName)
        onDispose {
            chatService?.setCurrentRoom(null)
        }
    }

    // Navigate back if this room is deleted
    LaunchedEffect(chatService, roomId) {
        chatService?.roomDeleted?.collect { event ->
            if (event.roomId == roomId) {
                android.util.Log.d("ChatScreen", "Room deleted, navigating back: ${event.roomName}")
                onBackClick()
            }
        }
    }

    // Auto-scroll to bottom when messages change (only if shouldScrollToBottom is true)
    LaunchedEffect(uiState.messages, uiState.shouldScrollToBottom) {
        if (uiState.messages.isNotEmpty() && uiState.shouldScrollToBottom) {
            // Small delay to let LazyColumn layout the new items
            delay(50)
            listState.animateScrollToItem(uiState.messages.size - 1)
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
                ),
                windowInsets = WindowInsets.statusBars
            )
        },
        bottomBar = {
            ChatInputBar(
                value = uiState.messageInput,
                onValueChange = viewModel::updateMessageInput,
                onSend = viewModel::sendMessage,
                isSending = uiState.isSending || uiState.isUploadingImage,
                isRecording = uiState.isRecording,
                recordingDuration = uiState.recordingDuration,
                hasAudioPermission = hasAudioPermission,
                onRequestAudioPermission = { audioPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO) },
                onStartRecording = viewModel::startRecording,
                onStopRecording = viewModel::stopRecordingAndSend,
                hasCameraPermission = hasCameraPermission,
                hasGalleryPermission = hasGalleryPermission,
                onRequestCameraPermission = { cameraPermissionLauncher.launch(Manifest.permission.CAMERA) },
                onRequestGalleryPermission = {
                    if (android.os.Build.VERSION.SDK_INT >= 33) {
                        galleryPermissionLauncher.launch(Manifest.permission.READ_MEDIA_IMAGES)
                    } else {
                        galleryPermissionLauncher.launch(Manifest.permission.READ_EXTERNAL_STORAGE)
                    }
                },
                onCameraClick = {
                    if (hasCameraPermission) {
                        imagePickers.cameraLauncher.launch(imagePickers.createCameraUri())
                    } else {
                        cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
                    }
                },
                onGalleryClick = {
                    if (hasGalleryPermission) {
                        imagePickers.galleryLauncher.launch(
                            PickVisualMediaRequest(PickVisualMedia.ImageOnly)
                        )
                    } else {
                        if (android.os.Build.VERSION.SDK_INT >= 33) {
                            galleryPermissionLauncher.launch(Manifest.permission.READ_MEDIA_IMAGES)
                        } else {
                            galleryPermissionLauncher.launch(Manifest.permission.READ_EXTERNAL_STORAGE)
                        }
                    }
                },
                selectedImageUri = uiState.selectedImageUri,
                isCompressingImage = uiState.isCompressingImage,
                onClearImage = viewModel::clearSelectedImage
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
                        // Load More button at the top
                        if (uiState.hasMoreMessages) {
                            item(key = "load_more") {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(8.dp),
                                    contentAlignment = Alignment.Center
                                ) {
                                    if (uiState.isLoadingMore) {
                                        CircularProgressIndicator(
                                            modifier = Modifier.size(24.dp),
                                            strokeWidth = 2.dp
                                        )
                                    } else {
                                        TextButton(onClick = { viewModel.loadMoreMessages() }) {
                                            Text("Charger plus de messages")
                                        }
                                    }
                                }
                            }
                        }

                        items(uiState.messages, key = { it.id }) { message ->
                            MessageBubble(
                                message = message,
                                isMyMessage = viewModel.isMyMessage(message),
                                currentUserId = uiState.currentUserId,
                                onReact = { emoji -> viewModel.reactToMessage(message.id, emoji) }
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
    onRequestAudioPermission: () -> Unit,
    onStartRecording: () -> Boolean,
    onStopRecording: () -> Unit,
    hasCameraPermission: Boolean,
    hasGalleryPermission: Boolean,
    onRequestCameraPermission: () -> Unit,
    onRequestGalleryPermission: () -> Unit,
    onCameraClick: () -> Unit,
    onGalleryClick: () -> Unit,
    selectedImageUri: Uri?,
    isCompressingImage: Boolean,
    onClearImage: () -> Unit
) {
    val currentOnStartRecording by rememberUpdatedState(onStartRecording)
    val currentOnStopRecording by rememberUpdatedState(onStopRecording)
    val currentHasPermission by rememberUpdatedState(hasAudioPermission)
    val currentIsSending by rememberUpdatedState(isSending)

    val micColor by animateColorAsState(
        targetValue = if (isRecording) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
        label = "micColor"
    )

    // Can send if has text OR has image selected
    val canSend = (value.isNotBlank() || selectedImageUri != null) && !isSending && !isRecording

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .navigationBarsPadding(),
        shadowElevation = 8.dp
    ) {
        Column {
            // Image preview (if selected)
            if (selectedImageUri != null) {
                ImagePreview(
                    imageUri = selectedImageUri,
                    isCompressing = isCompressingImage,
                    onRemove = onClearImage
                )
            }

            // Input row
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Camera button
                if (!isRecording) {
                    IconButton(
                        onClick = onCameraClick,
                        enabled = !isSending
                    ) {
                        Icon(
                            imageVector = Icons.Default.CameraAlt,
                            contentDescription = "Camera",
                            tint = if (!isSending) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }

                // Gallery button
                if (!isRecording) {
                    IconButton(
                        onClick = onGalleryClick,
                        enabled = !isSending
                    ) {
                        Icon(
                            imageVector = Icons.Default.Image,
                            contentDescription = "Gallery",
                            tint = if (!isSending) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }

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
                        placeholder = { Text(if (selectedImageUri != null) "Ajouter une legende..." else "Message...") },
                        maxLines = 4,
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                        keyboardActions = KeyboardActions(onSend = { if (canSend) onSend() }),
                        enabled = !isSending,
                        shape = RoundedCornerShape(24.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            cursorColor = AccentBlue,
                            focusedBorderColor = AccentBlue
                        )
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
                                    onRequestAudioPermission()
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
                    enabled = canSend
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
                            tint = if (canSend) {
                                AccentBlue
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ImagePreview(
    imageUri: Uri,
    isCompressing: Boolean,
    onRemove: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(CharcoalLight)
            .padding(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        AsyncImage(
            model = imageUri,
            contentDescription = "Image selectionnee",
            modifier = Modifier
                .size(60.dp)
                .clip(RoundedCornerShape(8.dp)),
            contentScale = ContentScale.Crop
        )
        Spacer(modifier = Modifier.width(8.dp))
        if (isCompressing) {
            CircularProgressIndicator(
                modifier = Modifier.size(24.dp),
                strokeWidth = 2.dp
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = "Compression...",
                style = MaterialTheme.typography.bodySmall,
                color = Color.White.copy(alpha = 0.7f)
            )
        }
        Spacer(modifier = Modifier.weight(1f))
        IconButton(onClick = onRemove) {
            Icon(
                imageVector = Icons.Default.Close,
                contentDescription = "Supprimer l'image",
                tint = Color.White
            )
        }
    }
}

private fun formatDuration(seconds: Int): String {
    val mins = seconds / 60
    val secs = seconds % 60
    return "%d:%02d".format(mins, secs)
}
