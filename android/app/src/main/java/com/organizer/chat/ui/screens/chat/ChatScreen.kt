package com.organizer.chat.ui.screens.chat

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.runtime.remember
import com.organizer.chat.util.MessageGroupingUtils
import kotlinx.coroutines.delay
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.input.TextFieldState
import androidx.compose.foundation.text.input.setTextAndPlaceCursorAtEnd
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.InsertDriveFile
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.automirrored.filled.ScreenShare
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.filled.Videocam
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
import com.organizer.chat.data.socket.ConnectionState
import com.organizer.chat.ui.theme.AccentBlue
import com.organizer.chat.service.ChatService
import com.organizer.chat.ui.components.ConnectionStatusIcon
import com.organizer.chat.ui.components.MessageBubble
import com.organizer.chat.ui.components.OfflineBanner
import com.organizer.chat.ui.components.VideoPreviewDialog
import com.organizer.chat.util.DocumentInfo
import com.organizer.chat.util.DocumentPicker
import com.organizer.chat.util.TokenManager
import com.organizer.chat.util.rememberImagePickerLaunchers
import com.organizer.chat.util.SharedContentManager
import com.organizer.chat.data.model.SharedContent
import com.organizer.chat.ui.screens.camera.CameraRecordScreen
import android.util.Log
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
    onBackClick: () -> Unit,
    onCallClick: (userId: String, username: String, withCamera: Boolean) -> Unit = { _, _, _ -> }
) {
    val context = LocalContext.current
    val viewModel = remember(roomId, chatService, context) {
        ChatViewModel(roomId, messageRepository, roomRepository, chatService, tokenManager, context)
    }
    val uiState by viewModel.uiState.collectAsState()
    val listState = rememberLazyListState()
    val coroutineScope = rememberCoroutineScope()

    // Connection state - use current state as initial to avoid flicker
    val initialConnectionState = remember {
        if (chatService?.socketManager?.isConnected() == true) ConnectionState.Connected
        else ConnectionState.Disconnected
    }
    val connectionState by chatService?.socketManager?.connectionState
        ?.collectAsState(initial = initialConnectionState)
        ?: remember { mutableStateOf(initialConnectionState) }

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

    // Document picker launcher
    val documentPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument()
    ) { uri ->
        uri?.let {
            val docInfo = DocumentPicker.getDocumentInfo(context, it)
            viewModel.selectFile(docInfo)
        }
    }

    // Screen capture launcher for video recording
    val screenCaptureLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK && result.data != null) {
            viewModel.onScreenCaptureGranted(result.resultCode, result.data!!)
        }
    }

    // Function to request screen capture permission
    val requestScreenCapture: () -> Unit = {
        val projectionManager = context.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        screenCaptureLauncher.launch(projectionManager.createScreenCaptureIntent())
    }

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
                Log.d("ChatScreen", "Room deleted, navigating back: ${event.roomName}")
                onBackClick()
            }
        }
    }

    // Handle shared content from other apps
    LaunchedEffect(roomId) {
        SharedContentManager.getPendingContent(roomId)?.let { content ->
            Log.d("ChatScreen", "Processing shared content for room $roomId")
            when (content) {
                is SharedContent.Text -> {
                    // Set text in the text field
                    viewModel.textFieldState.setTextAndPlaceCursorAtEnd(content.text)
                }
                is SharedContent.SingleImage -> {
                    // Select the image
                    viewModel.selectImage(content.uri)
                }
                is SharedContent.MultipleImages -> {
                    // Select the first image (TODO: handle multiple images)
                    content.uris.firstOrNull()?.let { uri ->
                        viewModel.selectImage(uri)
                    }
                }
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

    // Video preview dialog (screen recording)
    if (uiState.videoRecordingState == VideoRecordingState.PREVIEW ||
        uiState.videoRecordingState == VideoRecordingState.UPLOADING) {
        uiState.recordedVideoFile?.let { videoFile ->
            VideoPreviewDialog(
                videoFile = videoFile,
                isUploading = uiState.videoRecordingState == VideoRecordingState.UPLOADING,
                onSend = viewModel::sendRecordedVideo,
                onDiscard = viewModel::discardRecordedVideo,
                onRetry = {
                    viewModel.retryVideoRecording()
                    requestScreenCapture()
                },
                onDismiss = viewModel::discardRecordedVideo
            )
        }
    }

    // Camera recording screen
    if (uiState.cameraRecordingState == CameraRecordingState.RECORDING) {
        CameraRecordScreen(
            onRecordingComplete = { file ->
                viewModel.onCameraRecordingComplete(file)
            },
            onDismiss = viewModel::onCameraRecordingDismissed,
            onError = { error ->
                viewModel.onCameraRecordingDismissed()
                Log.e("ChatScreen", "Camera recording error: $error")
            }
        )
    }

    // Camera video preview dialog
    if (uiState.cameraRecordingState == CameraRecordingState.PREVIEW ||
        uiState.cameraRecordingState == CameraRecordingState.UPLOADING) {
        uiState.cameraRecordedFile?.let { videoFile ->
            VideoPreviewDialog(
                videoFile = videoFile,
                isUploading = uiState.cameraRecordingState == CameraRecordingState.UPLOADING,
                onSend = viewModel::sendCameraRecordedVideo,
                onDiscard = viewModel::discardCameraRecordedVideo,
                onRetry = viewModel::retryCameraRecording,
                onDismiss = viewModel::discardCameraRecordedVideo
            )
        }
    }

    Scaffold(
        topBar = {
            Column {
                TopAppBar(
                    title = { Text(roomName) },
                    navigationIcon = {
                        IconButton(onClick = onBackClick) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = "Retour"
                            )
                        }
                    },
                    actions = {
                        // Call button - only for private 1-to-1 rooms
                        val otherMemberId = uiState.humanMemberIds
                            .filter { it != uiState.currentUserId }
                            .singleOrNull()

                        if (otherMemberId != null) {
                            IconButton(
                                onClick = {
                                    onCallClick(otherMemberId, roomName, false)
                                }
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Call,
                                    contentDescription = "Appel audio"
                                )
                            }
                            IconButton(
                                onClick = {
                                    onCallClick(otherMemberId, roomName, true)
                                }
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Videocam,
                                    contentDescription = "Appel vidéo"
                                )
                            }
                        }

                        ConnectionStatusIcon(
                            connectionState = connectionState,
                            modifier = Modifier.padding(end = 8.dp)
                        )
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = MaterialTheme.colorScheme.primary,
                        titleContentColor = MaterialTheme.colorScheme.onPrimary,
                        navigationIconContentColor = MaterialTheme.colorScheme.onPrimary,
                        actionIconContentColor = MaterialTheme.colorScheme.onPrimary
                    ),
                    windowInsets = WindowInsets.statusBars
                )
                OfflineBanner(
                    connectionState = connectionState,
                    onRetry = { chatService?.reconnectIfNeeded() }
                )
            }
        },
        bottomBar = {
            ChatInputBar(
                textFieldState = viewModel.textFieldState,
                onSend = viewModel::sendMessage,
                isSending = uiState.isSending || uiState.isUploadingImage || uiState.isUploadingFile,
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
                onFileClick = { documentPickerLauncher.launch(arrayOf("*/*")) },
                selectedImageUri = uiState.selectedImageUri,
                isCompressingImage = uiState.isCompressingImage,
                onClearImage = viewModel::clearSelectedImage,
                selectedFileInfo = uiState.selectedFileInfo,
                isUploadingFile = uiState.isUploadingFile,
                onClearFile = viewModel::clearSelectedFile,
                // Video recording (screen)
                isVideoRecording = uiState.videoRecordingState == VideoRecordingState.RECORDING,
                videoRecordingDuration = uiState.videoRecordingDuration,
                onStartVideoRecording = requestScreenCapture,
                onStopVideoRecording = viewModel::stopVideoRecording,
                // Camera video recording
                onStartCameraRecording = {
                    if (hasCameraPermission) {
                        viewModel.startCameraRecording()
                    } else {
                        cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
                    }
                }
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
                    // Group consecutive messages from same sender (outside LazyColumn)
                    val messageGroups = remember(uiState.messages, uiState.currentUserId) {
                        MessageGroupingUtils.groupConsecutiveMessages(uiState.messages, uiState.currentUserId)
                    }

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

                        items(
                            items = messageGroups,
                            key = { group -> group.messages.first().id }
                        ) { group ->
                            val lastMsg = group.messages.last()
                            MessageBubble(
                                messages = group.messages,
                                isMyMessage = group.isMyMessage,
                                currentUserId = uiState.currentUserId,
                                humanMemberIds = uiState.humanMemberIds,
                                onReact = { emoji -> viewModel.reactToMessage(lastMsg.id, emoji) },
                                onDelete = if (group.isMyMessage) {
                                    { messageId -> viewModel.deleteMessage(messageId) }
                                } else null
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                        }

                        // Typing indicator at the bottom of messages (always reserve space)
                        item(key = "typing_indicator") {
                            TypingIndicator(isVisible = uiState.typingUsers.isNotEmpty())
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun TypingIndicator(isVisible: Boolean) {
    // Keep animations alive outside conditional to avoid recreation
    val infiniteTransition = rememberInfiniteTransition(label = "typing")
    val alphas = (0..2).map { index ->
        infiniteTransition.animateFloat(
            initialValue = 0.3f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(
                animation = tween(600, delayMillis = index * 200),
                repeatMode = RepeatMode.Reverse
            ),
            label = "alpha$index"
        )
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(24.dp)
            .padding(start = 16.dp),
        horizontalArrangement = Arrangement.Start,
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (isVisible) {
            alphas.forEach { alpha ->
                Box(
                    modifier = Modifier
                        .padding(horizontal = 2.dp)
                        .size(8.dp)
                        .background(
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = alpha.value),
                            shape = CircleShape
                        )
                )
            }
        }
    }
}

@Composable
private fun ChatInputBar(
    textFieldState: TextFieldState,
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
    onFileClick: () -> Unit,
    selectedImageUri: Uri?,
    isCompressingImage: Boolean,
    onClearImage: () -> Unit,
    selectedFileInfo: DocumentInfo?,
    isUploadingFile: Boolean,
    onClearFile: () -> Unit,
    // Video recording (screen)
    isVideoRecording: Boolean = false,
    videoRecordingDuration: Int = 0,
    onStartVideoRecording: () -> Unit = {},
    onStopVideoRecording: () -> Unit = {},
    // Camera video recording
    onStartCameraRecording: () -> Unit = {}
) {
    val currentOnStartRecording by rememberUpdatedState(onStartRecording)
    val currentOnStopRecording by rememberUpdatedState(onStopRecording)
    val currentHasPermission by rememberUpdatedState(hasAudioPermission)
    val currentIsSending by rememberUpdatedState(isSending)

    // Attachment menu state
    var isAttachmentMenuOpen by remember { mutableStateOf(false) }

    val micColor by animateColorAsState(
        targetValue = if (isRecording) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
        label = "micColor"
    )

    val videoRecordColor by animateColorAsState(
        targetValue = if (isVideoRecording) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
        label = "videoRecordColor"
    )

    // Can send if has text OR has image selected OR has file selected
    val canSend = (textFieldState.text.isNotBlank() || selectedImageUri != null || selectedFileInfo != null) && !isSending && !isRecording && !isVideoRecording

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

            // File preview (if selected)
            if (selectedFileInfo != null) {
                FilePreview(
                    fileInfo = selectedFileInfo,
                    isUploading = isUploadingFile,
                    onRemove = onClearFile
                )
            }

            // Attachment menu (collapsible)
            AnimatedVisibility(
                visible = isAttachmentMenuOpen && !isRecording && !isVideoRecording,
                enter = expandVertically() + fadeIn(),
                exit = shrinkVertically() + fadeOut()
            ) {
                AttachmentMenu(
                    onCameraClick = {
                        isAttachmentMenuOpen = false
                        onCameraClick()
                    },
                    onGalleryClick = {
                        isAttachmentMenuOpen = false
                        onGalleryClick()
                    },
                    onFileClick = {
                        isAttachmentMenuOpen = false
                        onFileClick()
                    },
                    onCameraVideoClick = {
                        isAttachmentMenuOpen = false
                        onStartCameraRecording()
                    },
                    onScreenRecordClick = {
                        isAttachmentMenuOpen = false
                        onStartVideoRecording()
                    },
                    isSending = isSending,
                    hasFileSelected = selectedFileInfo != null
                )
            }

            // Input row
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Toggle attachment menu button (hidden during recording)
                if (!isRecording && !isVideoRecording) {
                    IconButton(
                        onClick = { isAttachmentMenuOpen = !isAttachmentMenuOpen },
                        enabled = !isSending
                    ) {
                        Icon(
                            imageVector = if (isAttachmentMenuOpen) Icons.Default.Close else Icons.Default.Add,
                            contentDescription = if (isAttachmentMenuOpen) "Fermer le menu" else "Ouvrir le menu",
                            tint = if (!isSending) AccentBlue else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }

                if (isRecording) {
                    // Audio recording info instead of text field
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
                } else if (isVideoRecording) {
                    // Video recording info instead of text field
                    Row(
                        modifier = Modifier.weight(1f),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "Enreg. écran...",
                            color = MaterialTheme.colorScheme.error
                        )
                        Spacer(modifier = Modifier.weight(1f))
                        Text(
                            text = formatDuration(videoRecordingDuration),
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.error
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        // Stop button for screen recording
                        Box(
                            modifier = Modifier
                                .size(48.dp)
                                .clip(CircleShape)
                                .background(videoRecordColor.copy(alpha = 0.2f)),
                            contentAlignment = Alignment.Center
                        ) {
                            IconButton(onClick = onStopVideoRecording) {
                                Icon(
                                    imageVector = Icons.Default.Stop,
                                    contentDescription = "Arrêter l'enregistrement",
                                    tint = videoRecordColor
                                )
                            }
                        }
                    }
                } else {
                    OutlinedTextField(
                        value = textFieldState.text.toString(),
                        onValueChange = { textFieldState.setTextAndPlaceCursorAtEnd(it) },
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(24.dp)),
                        placeholder = { Text(if (selectedImageUri != null || selectedFileInfo != null) "Ajouter une legende..." else "Message...") },
                        maxLines = 4,
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                        keyboardActions = KeyboardActions(onSend = { if (canSend) onSend() }),
                        shape = RoundedCornerShape(24.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            cursorColor = AccentBlue,
                            focusedBorderColor = AccentBlue
                        )
                    )
                }

                Spacer(modifier = Modifier.width(8.dp))

                // Mic button - ALWAYS present (except during video recording), same pointerInput
                if (!isVideoRecording) {
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
                }

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
private fun AttachmentMenu(
    onCameraClick: () -> Unit,
    onGalleryClick: () -> Unit,
    onFileClick: () -> Unit,
    onCameraVideoClick: () -> Unit,
    onScreenRecordClick: () -> Unit,
    isSending: Boolean,
    hasFileSelected: Boolean
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(CharcoalLight)
            .padding(vertical = 12.dp, horizontal = 16.dp),
        horizontalArrangement = Arrangement.SpaceEvenly,
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Camera photo
        AttachmentMenuItem(
            icon = Icons.Default.CameraAlt,
            label = "Photo",
            onClick = onCameraClick,
            enabled = !isSending
        )

        // Gallery
        AttachmentMenuItem(
            icon = Icons.Default.Image,
            label = "Galerie",
            onClick = onGalleryClick,
            enabled = !isSending
        )

        // File
        AttachmentMenuItem(
            icon = Icons.Default.AttachFile,
            label = "Fichier",
            onClick = onFileClick,
            enabled = !isSending && !hasFileSelected
        )

        // Camera video
        AttachmentMenuItem(
            icon = Icons.Default.Videocam,
            label = "Vidéo",
            onClick = onCameraVideoClick,
            enabled = !isSending
        )

        // Screen recording
        AttachmentMenuItem(
            icon = Icons.AutoMirrored.Filled.ScreenShare,
            label = "Écran",
            onClick = onScreenRecordClick,
            enabled = !isSending
        )
    }
}

@Composable
private fun AttachmentMenuItem(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    onClick: () -> Unit,
    enabled: Boolean
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        IconButton(
            onClick = onClick,
            enabled = enabled,
            modifier = Modifier
                .size(48.dp)
                .clip(CircleShape)
                .background(AccentBlue.copy(alpha = if (enabled) 0.2f else 0.1f))
        ) {
            Icon(
                imageVector = icon,
                contentDescription = label,
                tint = if (enabled) AccentBlue else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
            )
        }
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = if (enabled) Color.White else Color.White.copy(alpha = 0.5f)
        )
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

@Composable
private fun FilePreview(
    fileInfo: DocumentInfo,
    isUploading: Boolean,
    onRemove: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(CharcoalLight)
            .padding(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = Icons.Default.InsertDriveFile,
            contentDescription = null,
            modifier = Modifier.size(40.dp),
            tint = AccentBlue
        )
        Spacer(modifier = Modifier.width(8.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = fileInfo.fileName,
                style = MaterialTheme.typography.bodyMedium,
                color = Color.White,
                maxLines = 1
            )
            Text(
                text = DocumentPicker.formatFileSize(fileInfo.fileSize),
                style = MaterialTheme.typography.bodySmall,
                color = Color.White.copy(alpha = 0.7f)
            )
        }
        if (isUploading) {
            CircularProgressIndicator(
                modifier = Modifier.size(24.dp),
                strokeWidth = 2.dp
            )
        } else {
            IconButton(onClick = onRemove) {
                Icon(
                    imageVector = Icons.Default.Close,
                    contentDescription = "Supprimer le fichier",
                    tint = Color.White
                )
            }
        }
    }
}

private fun formatDuration(seconds: Int): String {
    val mins = seconds / 60
    val secs = seconds % 60
    return "%d:%02d".format(mins, secs)
}
