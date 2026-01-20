package com.organizer.chat.ui.components

import android.Manifest
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.text.method.LinkMovementMethod
import android.util.Base64
import android.util.TypedValue
import android.view.MotionEvent
import android.widget.TextView
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import io.noties.markwon.Markwon
import io.noties.markwon.linkify.LinkifyPlugin
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import java.io.File
import java.io.FileOutputStream
import com.organizer.chat.data.api.ApiClient
import com.organizer.chat.data.model.Message
import com.organizer.chat.data.model.Reaction
import com.organizer.chat.ui.theme.MessageReceived
import com.organizer.chat.ui.theme.MessageSent
import java.text.SimpleDateFormat
import java.util.*
import androidx.compose.foundation.border
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Done
import androidx.compose.material.icons.filled.DoneAll
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.InsertDriveFile
import androidx.compose.material.icons.filled.PictureAsPdf
import androidx.compose.material.icons.filled.Computer
import androidx.compose.material.icons.filled.PhoneAndroid
import androidx.compose.material.icons.filled.SmartToy
import androidx.compose.material3.CircularProgressIndicator
import com.organizer.chat.util.ImageDownloader
import androidx.compose.ui.text.style.TextAlign
import com.organizer.chat.ui.theme.AccentBlue
import com.organizer.chat.ui.theme.CharcoalLight
import com.organizer.chat.ui.theme.OfflineGray
import com.organizer.chat.ui.theme.OnlineGreen
import com.organizer.chat.ui.screens.users.getStatusColor

// Fixed colors for message bubbles (readable on both light/dark backgrounds)
private val MessageTextColor = androidx.compose.ui.graphics.Color(0xFF1A1A1A)
private val MessageSecondaryColor = androidx.compose.ui.graphics.Color(0xFF666666)


// Available reaction emojis
val ALLOWED_EMOJIS = listOf("👍", "❤️", "😂", "😮", "😢", "😡", "✅", "⚠️", "🙏", "🎉", "👋", "😘")

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun MessageBubble(
    messages: List<Message>,
    isMyMessage: Boolean,
    currentUserId: String? = null,
    humanMemberIds: List<String> = emptyList(),
    onReact: ((String) -> Unit)? = null,
    onDelete: ((String) -> Unit)? = null
) {
    if (messages.isEmpty()) return

    val firstMsg = messages.first()
    val lastMsg = messages.last()

    // System messages get special rendering
    if (firstMsg.type == "system") {
        SystemMessageContent(
            content = firstMsg.content,
            createdAt = firstMsg.createdAt,
            reactions = firstMsg.reactions,
            currentUserId = currentUserId,
            onReact = onReact
        )
        return
    }

    var showReactionPicker by remember { mutableStateOf(false) }
    var showDeleteDialog by remember { mutableStateOf(false) }

    val bubbleShape = if (isMyMessage) {
        RoundedCornerShape(16.dp, 16.dp, 4.dp, 16.dp)
    } else {
        RoundedCornerShape(16.dp, 16.dp, 16.dp, 4.dp)
    }

    val bubbleColor = if (isMyMessage) MessageSent else MessageReceived

    // Callback for long press - will be passed to content components
    val onLongPress: (() -> Unit)? = if (isMyMessage && onDelete != null) {
        { showDeleteDialog = true }
    } else null

    // Get the "best" status across all messages in the group
    val groupStatus = if (isMyMessage) {
        val statusOrder = listOf("failed", "sending", "sent", "delivered", "read")
        messages.maxByOrNull { statusOrder.indexOf(it.status) }?.status ?: lastMsg.status
    } else null

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp, vertical = 2.dp),
        horizontalAlignment = if (isMyMessage) Alignment.End else Alignment.Start
    ) {
        // Sender name with status indicator (special badge for Eko)
        val isEko = firstMsg.senderId.displayName.lowercase() == "eko"
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(
                start = if (isMyMessage) 0.dp else 8.dp,
                end = if (isMyMessage) 8.dp else 0.dp,
                bottom = 2.dp
            )
        ) {
            if (isEko) {
                // Eko badge with bot icon
                Icon(
                    imageVector = Icons.Default.SmartToy,
                    contentDescription = "Bot",
                    modifier = Modifier.size(14.dp),
                    tint = Color(0xFFA78BFA) // Purple color
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    text = "Eko",
                    style = MaterialTheme.typography.labelSmall,
                    color = Color(0xFFA78BFA) // Purple color
                )
            } else {
                // Normal user with status indicator dot
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .background(
                            color = getStatusColor(firstMsg.senderId.status),
                            shape = CircleShape
                        )
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    text = firstMsg.senderId.displayName,
                    style = MaterialTheme.typography.labelSmall,
                    color = AccentBlue
                )
                // Status message if present
                firstMsg.senderId.statusMessage?.let { statusMsg ->
                    Text(
                        text = " · $statusMsg",
                        style = MaterialTheme.typography.labelSmall,
                        color = Color.Gray,
                        maxLines = 1
                    )
                }
            }
        }

        Box {
            // Long press on bubble padding (content components handle their own long press)
            Surface(
                shape = bubbleShape,
                color = bubbleColor,
                shadowElevation = 1.dp,
                modifier = Modifier
                    .widthIn(max = 280.dp)
                    .pointerInput(onLongPress) {
                        detectTapGestures(
                            onLongPress = { onLongPress?.invoke() }
                        )
                    }
            ) {
                Column(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)
                ) {
                    // Render all messages in the group
                    messages.forEachIndexed { index, message ->
                        when (message.type) {
                            "audio" -> AudioMessageContent(
                                base64Content = message.content,
                                messageId = message.id,
                                onLongPress = onLongPress
                            )
                            "image" -> {
                                if (message.fileDeleted) {
                                    DeletedFileContent(caption = message.caption)
                                } else {
                                    ImageMessageContent(
                                        imageUrl = message.content,
                                        caption = message.caption,
                                        onLongPress = onLongPress
                                    )
                                }
                            }
                            "file" -> {
                                if (message.fileDeleted) {
                                    DeletedFileContent(caption = message.caption)
                                } else {
                                    FileMessageContent(
                                        fileUrl = message.content,
                                        fileName = message.fileName,
                                        fileSize = message.fileSize,
                                        mimeType = message.mimeType,
                                        caption = message.caption,
                                        onLongPress = onLongPress
                                    )
                                }
                            }
                            else -> {
                                TextMessageContent(
                                    content = message.content,
                                    onLongPress = onLongPress
                                )
                                // Add line break between text messages (not after the last one)
                                if (index < messages.size - 1 && messages[index + 1].type == "text") {
                                    Spacer(modifier = Modifier.height(2.dp))
                                }
                            }
                        }
                    }

                    // Timestamp and read receipt
                    Spacer(modifier = Modifier.height(4.dp))
                    Row(
                        modifier = Modifier.align(Alignment.End),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Text(
                            text = formatTime(lastMsg.createdAt),
                            style = MaterialTheme.typography.labelSmall,
                            color = MessageSecondaryColor
                        )
                        // Show read receipt only for own messages
                        if (isMyMessage && groupStatus != null) {
                            ReadReceiptForStatus(
                                status = groupStatus,
                                readBy = lastMsg.readBy,
                                humanMemberIds = humanMemberIds,
                                currentUserId = currentUserId
                            )
                        }
                        // Client source icon
                        lastMsg.clientSource?.let { source ->
                            Icon(
                                imageVector = when (source) {
                                    "desktop" -> Icons.Default.Computer
                                    "android" -> Icons.Default.PhoneAndroid
                                    else -> Icons.Default.SmartToy
                                },
                                contentDescription = source,
                                modifier = Modifier.size(12.dp),
                                tint = MessageSecondaryColor.copy(alpha = 0.5f)
                            )
                        }
                    }
                }
            }
        }

        // Reaction bar - always show for last message
        ReactionBar(
            reactions = lastMsg.reactions,
            currentUserId = currentUserId,
            onReact = { emoji ->
                onReact?.invoke(emoji)
            },
            onShowPicker = { showReactionPicker = true },
            modifier = Modifier.padding(top = 4.dp)
        )
    }

    // Reaction picker dialog
    if (showReactionPicker) {
        ReactionPickerDialog(
            onReact = { emoji ->
                onReact?.invoke(emoji)
                showReactionPicker = false
            },
            onDismiss = { showReactionPicker = false }
        )
    }

    // Delete confirmation dialog - deletes the LAST message in the group
    if (showDeleteDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = { Text("Supprimer le message") },
            text = { Text("Voulez-vous vraiment supprimer ce message ?") },
            confirmButton = {
                TextButton(
                    onClick = {
                        showDeleteDialog = false
                        onDelete?.invoke(lastMsg.id)
                    },
                    colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)
                ) {
                    Text("Supprimer")
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteDialog = false }) {
                    Text("Annuler")
                }
            }
        )
    }
}

// Link color for URLs
private val LinkColor = Color(0xFF1976D2)

@Composable
private fun TextMessageContent(
    content: String,
    onLongPress: (() -> Unit)? = null
) {
    val context = LocalContext.current
    val markwon = remember {
        Markwon.builder(context)
            .usePlugin(LinkifyPlugin.create())
            .build()
    }
    val spanned = remember(content) { markwon.toMarkdown(content) }

    // Track long press state
    var longPressTriggered by remember { mutableStateOf(false) }

    AndroidView(
        factory = { ctx ->
            TextView(ctx).apply {
                setTextColor(MessageTextColor.toArgb())
                setLinkTextColor(LinkColor.toArgb())
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
                movementMethod = LinkMovementMethod.getInstance()
                // Handle long press via touch listener
                var longPressRunnable: Runnable? = null
                setOnTouchListener { view, event ->
                    when (event.action) {
                        MotionEvent.ACTION_DOWN -> {
                            longPressTriggered = false
                            longPressRunnable = Runnable {
                                longPressTriggered = true
                                onLongPress?.invoke()
                            }
                            view.postDelayed(longPressRunnable, android.view.ViewConfiguration.getLongPressTimeout().toLong())
                        }
                        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                            longPressRunnable?.let { view.removeCallbacks(it) }
                            longPressRunnable = null
                        }
                    }
                    // Return false to allow LinkMovementMethod to handle link clicks
                    false
                }
            }
        },
        update = { textView ->
            markwon.setParsedMarkdown(textView, spanned)
        },
        modifier = Modifier
    )
}

@Composable
private fun SystemMessageContent(
    content: String,
    createdAt: String,
    reactions: List<Reaction> = emptyList(),
    currentUserId: String? = null,
    onReact: ((String) -> Unit)? = null
) {
    var showReactionPicker by remember { mutableStateOf(false) }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp, horizontal = 16.dp),
        contentAlignment = Alignment.Center
    ) {
        Surface(
            shape = RoundedCornerShape(12.dp),
            color = CharcoalLight,
            shadowElevation = 1.dp
        ) {
            Column(
                modifier = Modifier.padding(12.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                // Header with icon
                Icon(
                    imageVector = Icons.Default.Campaign,
                    contentDescription = null,
                    tint = AccentBlue,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.height(8.dp))
                // Content aligned left
                Text(
                    text = content,
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color.White.copy(alpha = 0.9f),
                    textAlign = TextAlign.Start,
                    modifier = Modifier.fillMaxWidth()
                )

                // Reactions
                if (reactions.isNotEmpty() || onReact != null) {
                    Spacer(modifier = Modifier.height(8.dp))
                    ReactionBar(
                        reactions = reactions,
                        currentUserId = currentUserId,
                        onReact = { emoji -> onReact?.invoke(emoji) },
                        onShowPicker = { showReactionPicker = true }
                    )
                }

                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = formatTime(createdAt),
                    style = MaterialTheme.typography.labelSmall,
                    color = Color.White.copy(alpha = 0.5f)
                )
            }
        }
    }

    // Reaction picker dialog
    if (showReactionPicker) {
        ReactionPickerDialog(
            onReact = { emoji ->
                onReact?.invoke(emoji)
                showReactionPicker = false
            },
            onDismiss = { showReactionPicker = false }
        )
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun AudioMessageContent(
    base64Content: String,
    messageId: String,
    onLongPress: (() -> Unit)? = null
) {
    val context = LocalContext.current
    var isPlaying by remember { mutableStateOf(false) }
    var mediaPlayer by remember { mutableStateOf<MediaPlayer?>(null) }

    DisposableEffect(Unit) {
        onDispose {
            mediaPlayer?.release()
        }
    }

    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .padding(vertical = 4.dp)
            .combinedClickable(
                onClick = {
                    if (isPlaying) {
                        mediaPlayer?.stop()
                        mediaPlayer?.release()
                        mediaPlayer = null
                        isPlaying = false
                    } else {
                        try {
                            // Extract base64 data (remove data:audio/...;base64, prefix if present)
                            val base64Data = if (base64Content.contains(",")) {
                                base64Content.substringAfter(",")
                            } else {
                                base64Content
                            }

                            val audioBytes = Base64.decode(base64Data, Base64.DEFAULT)
                            val tempFile = File(context.cacheDir, "audio_$messageId.tmp")
                            FileOutputStream(tempFile).use { it.write(audioBytes) }

                            mediaPlayer = MediaPlayer().apply {
                                setDataSource(tempFile.absolutePath)
                                prepare()
                                start()
                                setOnCompletionListener {
                                    isPlaying = false
                                    release()
                                    mediaPlayer = null
                                }
                            }
                            isPlaying = true
                        } catch (e: Exception) {
                            e.printStackTrace()
                        }
                    }
                },
                onLongClick = { onLongPress?.invoke() }
            )
    ) {
        Icon(
            imageVector = if (isPlaying) Icons.Default.Stop else Icons.Default.PlayArrow,
            contentDescription = if (isPlaying) "Stop" else "Play",
            tint = MessageSecondaryColor,
            modifier = Modifier.size(24.dp)
        )
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            text = if (isPlaying) "Lecture..." else "Message vocal",
            style = MaterialTheme.typography.bodyMedium,
            color = MessageTextColor
        )
    }
}

@Composable
private fun DeletedFileContent(
    caption: String?
) {
    Column {
        // Deleted file placeholder
        Surface(
            shape = RoundedCornerShape(8.dp),
            color = CharcoalLight.copy(alpha = 0.5f),
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                modifier = Modifier.padding(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = Icons.Default.Image,
                    contentDescription = null,
                    modifier = Modifier.size(24.dp),
                    tint = Color.Gray
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "Fichier supprimé",
                    style = MaterialTheme.typography.bodyMedium.copy(
                        fontStyle = androidx.compose.ui.text.font.FontStyle.Italic
                    ),
                    color = Color.Gray
                )
            }
        }

        // Show caption if present
        if (!caption.isNullOrBlank()) {
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = caption,
                style = MaterialTheme.typography.bodyMedium,
                color = MessageTextColor
            )
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ImageMessageContent(
    imageUrl: String,
    caption: String?,
    onLongPress: (() -> Unit)? = null
) {
    val context = LocalContext.current
    var showFullscreen by remember { mutableStateOf(false) }

    // Permission state for Android 8-9
    var hasStoragePermission by remember {
        mutableStateOf(
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ||
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.WRITE_EXTERNAL_STORAGE
            ) == PackageManager.PERMISSION_GRANTED
        )
    }

    var pendingDownloadUrl by remember { mutableStateOf<String?>(null) }

    val storagePermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        hasStoragePermission = isGranted
        if (isGranted && pendingDownloadUrl != null) {
            performImageDownload(context, pendingDownloadUrl!!)
            pendingDownloadUrl = null
        } else if (!isGranted) {
            Toast.makeText(context, "Permission requise pour telecharger", Toast.LENGTH_SHORT).show()
        }
    }

    fun handleDownload(url: String) {
        if (ImageDownloader.needsStoragePermission() && !hasStoragePermission) {
            pendingDownloadUrl = url
            storagePermissionLauncher.launch(Manifest.permission.WRITE_EXTERNAL_STORAGE)
        } else {
            performImageDownload(context, url)
        }
    }

    Column {
        if (imageUrl.startsWith("data:")) {
            // Base64 data URL (clipboard paste) - decode manually
            val base64Data = imageUrl.substringAfter(",")
            val imageBytes = try {
                Base64.decode(base64Data, Base64.DEFAULT)
            } catch (e: Exception) {
                null
            }

            if (imageBytes != null) {
                val bitmap = BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.size)
                if (bitmap != null) {
                    Image(
                        bitmap = bitmap.asImageBitmap(),
                        contentDescription = "Image",
                        modifier = Modifier
                            .widthIn(max = 250.dp)
                            .heightIn(max = 300.dp)
                            .combinedClickable(
                                onClick = { showFullscreen = true },
                                onLongClick = { onLongPress?.invoke() }
                            ),
                        contentScale = ContentScale.Crop
                    )

                    if (showFullscreen) {
                        FullscreenImageDialog(
                            imageUrl = imageUrl,
                            onDismiss = { showFullscreen = false },
                            onDownload = {
                                handleDownload(imageUrl)
                                showFullscreen = false
                            }
                        )
                    }
                }
            }
        } else {
            // HTTP URL - use Coil
            val fullImageUrl = if (imageUrl.startsWith("/")) {
                // Relative URL from server - prefix with API base URL
                ApiClient.getBaseUrl().trimEnd('/') + imageUrl
            } else {
                // Full URL - use as-is
                imageUrl
            }

            AsyncImage(
                model = fullImageUrl,
                contentDescription = "Image",
                modifier = Modifier
                    .widthIn(max = 250.dp)
                    .heightIn(max = 300.dp)
                    .combinedClickable(
                        onClick = { showFullscreen = true },
                        onLongClick = { onLongPress?.invoke() }
                    ),
                contentScale = ContentScale.Crop
            )

            if (showFullscreen) {
                FullscreenImageDialog(
                    imageUrl = fullImageUrl,
                    onDismiss = { showFullscreen = false },
                    onDownload = {
                        handleDownload(fullImageUrl)
                        showFullscreen = false
                    }
                )
            }
        }

        // Show caption if present
        if (!caption.isNullOrBlank()) {
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = caption,
                style = MaterialTheme.typography.bodyMedium,
                color = MessageTextColor
            )
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun FileMessageContent(
    fileUrl: String,
    fileName: String?,
    fileSize: Long?,
    mimeType: String?,
    caption: String?,
    onLongPress: (() -> Unit)? = null
) {
    val context = LocalContext.current
    var isDownloading by remember { mutableStateOf(false) }

    // Color for file icon and download icon
    val linkColor = Color(0xFF6B9FFF)

    Column {
        Surface(
            shape = RoundedCornerShape(8.dp),
            color = MessageSecondaryColor.copy(alpha = 0.1f),
            modifier = Modifier
                .combinedClickable(
                    onClick = {
                        if (!isDownloading) {
                            isDownloading = true
                            downloadFile(context, fileUrl, fileName ?: "file") {
                                isDownloading = false
                            }
                        }
                    },
                    onLongClick = { onLongPress?.invoke() }
                )
        ) {
            Row(
                modifier = Modifier.padding(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = getFileIcon(mimeType),
                    contentDescription = null,
                    modifier = Modifier.size(32.dp),
                    tint = linkColor
                )
                Spacer(modifier = Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = fileName ?: "Fichier",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MessageTextColor,
                        maxLines = 2
                    )
                    if (fileSize != null) {
                        Text(
                            text = formatFileSize(fileSize),
                            style = MaterialTheme.typography.bodySmall,
                            color = MessageSecondaryColor
                        )
                    }
                }
                if (isDownloading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        strokeWidth = 2.dp
                    )
                } else {
                    Icon(
                        imageVector = Icons.Default.Download,
                        contentDescription = "Download",
                        tint = linkColor
                    )
                }
            }
        }

        // Show caption if present
        if (!caption.isNullOrBlank()) {
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = caption,
                style = MaterialTheme.typography.bodyMedium,
                color = MessageTextColor
            )
        }
    }
}

private fun getFileIcon(mimeType: String?): androidx.compose.ui.graphics.vector.ImageVector {
    return when {
        mimeType?.startsWith("application/pdf") == true -> Icons.Default.PictureAsPdf
        mimeType?.contains("word") == true -> Icons.Default.InsertDriveFile
        mimeType?.contains("excel") == true -> Icons.Default.InsertDriveFile
        mimeType?.contains("powerpoint") == true -> Icons.Default.InsertDriveFile
        else -> Icons.Default.InsertDriveFile
    }
}

private fun formatFileSize(bytes: Long): String {
    return when {
        bytes < 1024 -> "$bytes B"
        bytes < 1024 * 1024 -> "${bytes / 1024} KB"
        else -> String.format("%.1f MB", bytes / (1024.0 * 1024.0))
    }
}

private fun downloadFile(context: Context, fileUrl: String, fileName: String, onComplete: () -> Unit) {
    val fullUrl = if (fileUrl.startsWith("/")) {
        ApiClient.getBaseUrl().trimEnd('/') + fileUrl
    } else {
        fileUrl
    }

    try {
        val request = DownloadManager.Request(Uri.parse(fullUrl)).apply {
            setTitle(fileName)
            setDescription("Telechargement en cours...")
            setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName)
        }

        val downloadManager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        downloadManager.enqueue(request)

        Toast.makeText(context, "Telechargement demarre...", Toast.LENGTH_SHORT).show()
    } catch (e: Exception) {
        Toast.makeText(context, "Erreur: ${e.message}", Toast.LENGTH_SHORT).show()
    }
    onComplete()
}

private fun performImageDownload(context: Context, imageUrl: String) {
    when (val result = ImageDownloader.downloadImage(context, imageUrl)) {
        is ImageDownloader.DownloadResult.Success -> {
            Toast.makeText(
                context,
                "Image enregistree: ${result.fileName}",
                Toast.LENGTH_SHORT
            ).show()
        }
        is ImageDownloader.DownloadResult.Error -> {
            Toast.makeText(
                context,
                "Erreur: ${result.message}",
                Toast.LENGTH_SHORT
            ).show()
        }
    }
}

@Composable
private fun ReadReceiptForStatus(
    status: String,
    readBy: List<String>,
    humanMemberIds: List<String>,
    currentUserId: String?
) {
    // Calculate if ALL other human members have read the message
    val isAllRead = if (currentUserId != null && humanMemberIds.isNotEmpty()) {
        val otherHumanMembers = humanMemberIds.filter { it != currentUserId }
        otherHumanMembers.isNotEmpty() && otherHumanMembers.all { readBy.contains(it) }
    } else {
        false
    }

    // Use group status for icon selection
    val icon = when {
        status == "sending" -> Icons.Default.Done
        status == "read" || isAllRead -> Icons.Default.CheckCircle
        else -> Icons.Default.DoneAll
    }

    val tint = if (status == "read" || isAllRead) OnlineGreen else OfflineGray

    Icon(
        imageVector = icon,
        contentDescription = if (status == "read" || isAllRead) "Lu" else "Envoyé",
        modifier = Modifier.size(14.dp),
        tint = tint
    )
}

private fun formatTime(isoDate: String): String {
    return try {
        val inputFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.getDefault())
        inputFormat.timeZone = TimeZone.getTimeZone("UTC")
        val date = inputFormat.parse(isoDate) ?: return ""

        val outputFormat = SimpleDateFormat("HH:mm", Locale.getDefault())
        outputFormat.format(date)
    } catch (e: Exception) {
        ""
    }
}

// Aggregate reactions by emoji
private data class ReactionCount(
    val emoji: String,
    val count: Int,
    val userIds: List<String>
)

private fun aggregateReactions(reactions: List<Reaction>): List<ReactionCount> {
    return reactions.groupBy { it.emoji }
        .map { (emoji, list) ->
            ReactionCount(
                emoji = emoji,
                count = list.size,
                userIds = list.map { it.userId }
            )
        }
}

@Composable
private fun ReactionBar(
    reactions: List<Reaction>,
    currentUserId: String?,
    onReact: (String) -> Unit,
    onShowPicker: () -> Unit,
    modifier: Modifier = Modifier
) {
    val aggregated = aggregateReactions(reactions)

    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        aggregated.forEach { reaction ->
            val isActive = currentUserId != null && reaction.userIds.contains(currentUserId)

            Surface(
                shape = RoundedCornerShape(12.dp),
                color = if (isActive) MaterialTheme.colorScheme.primaryContainer
                        else MaterialTheme.colorScheme.surfaceVariant,
                modifier = Modifier.clickable { onReact(reaction.emoji) }
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(text = reaction.emoji, style = MaterialTheme.typography.bodySmall)
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = reaction.count.toString(),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }

        // Add reaction button
        Surface(
            shape = RoundedCornerShape(12.dp),
            color = Color.Transparent,
            modifier = Modifier
                .size(28.dp)
                .border(
                    width = 1.dp,
                    color = MaterialTheme.colorScheme.outline.copy(alpha = 0.5f),
                    shape = RoundedCornerShape(12.dp)
                )
                .clickable { onShowPicker() }
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(
                    imageVector = Icons.Default.Add,
                    contentDescription = "Add reaction",
                    modifier = Modifier.size(16.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
private fun ReactionPickerDialog(
    onReact: (String) -> Unit,
    onDismiss: () -> Unit
) {
    Dialog(onDismissRequest = onDismiss) {
        Surface(
            shape = RoundedCornerShape(16.dp),
            color = MaterialTheme.colorScheme.surface,
            shadowElevation = 8.dp
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                ALLOWED_EMOJIS.chunked(6).forEach { rowEmojis ->
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        rowEmojis.forEach { emoji ->
                            Text(
                                text = emoji,
                                style = MaterialTheme.typography.headlineMedium,
                                modifier = Modifier.clickable { onReact(emoji) }
                            )
                        }
                    }
                }
            }
        }
    }
}
