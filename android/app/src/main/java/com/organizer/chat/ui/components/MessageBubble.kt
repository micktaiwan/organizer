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
import android.util.Base64
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
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
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.InsertDriveFile
import androidx.compose.material.icons.filled.PictureAsPdf
import androidx.compose.material3.CircularProgressIndicator
import com.organizer.chat.util.ImageDownloader
import androidx.compose.ui.text.style.TextAlign
import com.organizer.chat.ui.theme.AccentBlue
import com.organizer.chat.ui.theme.CharcoalLight
import com.organizer.chat.ui.screens.location.getStatusColor

// Fixed colors for message bubbles (readable on both light/dark backgrounds)
private val MessageTextColor = androidx.compose.ui.graphics.Color(0xFF1A1A1A)
private val MessageSecondaryColor = androidx.compose.ui.graphics.Color(0xFF666666)


// Available reaction emojis
val ALLOWED_EMOJIS = listOf("👍", "❤️", "😂", "😮", "😢", "😡", "✅", "⚠️", "🙏", "🎉", "👋", "😘")

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun MessageBubble(
    message: Message,
    isMyMessage: Boolean,
    isGroupedWithPrevious: Boolean = false,
    isLastInGroup: Boolean = true,
    currentUserId: String? = null,
    onReact: ((String) -> Unit)? = null,
    onDelete: (() -> Unit)? = null
) {
    // System messages get special rendering
    if (message.type == "system") {
        SystemMessageContent(
            content = message.content,
            createdAt = message.createdAt,
            reactions = message.reactions,
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

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp, vertical = if (isGroupedWithPrevious) 0.dp else 2.dp),
        horizontalAlignment = if (isMyMessage) Alignment.End else Alignment.Start
    ) {
        // Show sender name with status indicator only if NOT grouped with previous
        if (!isGroupedWithPrevious) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(
                    start = if (isMyMessage) 0.dp else 8.dp,
                    end = if (isMyMessage) 8.dp else 0.dp,
                    bottom = 2.dp
                )
            ) {
                // Status indicator dot
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .background(
                            color = getStatusColor(message.senderId.status),
                            shape = CircleShape
                        )
                )
                Spacer(modifier = Modifier.width(4.dp))
                // Sender name
                Text(
                    text = message.senderId.displayName,
                    style = MaterialTheme.typography.labelSmall,
                    color = AccentBlue
                )
                // Status message if present
                message.senderId.statusMessage?.let { statusMsg ->
                    Text(
                        text = " · $statusMsg",
                        style = MaterialTheme.typography.labelSmall,
                        color = Color.Gray,
                        maxLines = 1
                    )
                }
            }
        }

        // Callback for long press - will be passed to content components
        val onLongPress: (() -> Unit)? = if (isMyMessage && onDelete != null) {
            { showDeleteDialog = true }
        } else null

        Box {
            Surface(
                shape = bubbleShape,
                color = bubbleColor,
                shadowElevation = 1.dp,
                modifier = Modifier.widthIn(max = 280.dp)
            ) {
                Column(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)
                ) {
                    // Content based on message type
                    // Each component handles its own tap AND long press via combinedClickable
                    when (message.type) {
                        "audio" -> AudioMessageContent(
                            base64Content = message.content,
                            messageId = message.id,
                            onLongPress = onLongPress
                        )
                        "image" -> ImageMessageContent(
                            imageUrl = message.content,
                            caption = message.caption,
                            onLongPress = onLongPress
                        )
                        "file" -> FileMessageContent(
                            fileUrl = message.content,
                            fileName = message.fileName,
                            fileSize = message.fileSize,
                            mimeType = message.mimeType,
                            caption = message.caption,
                            onLongPress = onLongPress
                        )
                        else -> TextMessageContent(
                            content = message.content,
                            onLongPress = onLongPress
                        )
                    }

                    // Timestamp - only show if last in group
                    if (isLastInGroup) {
                        Spacer(modifier = Modifier.height(4.dp))

                        Text(
                            text = formatTime(message.createdAt),
                            style = MaterialTheme.typography.labelSmall,
                            color = MessageSecondaryColor,
                            modifier = Modifier.align(Alignment.End)
                        )
                    }
                }
            }
        }

        // Reaction bar - show on last message of group or if there are reactions
        if (message.reactions.isNotEmpty() || isLastInGroup) {
            ReactionBar(
                reactions = message.reactions,
                currentUserId = currentUserId,
                onReact = { emoji ->
                    onReact?.invoke(emoji)
                },
                onShowPicker = { showReactionPicker = true },
                modifier = Modifier.padding(top = 4.dp)
            )
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

    // Delete confirmation dialog
    if (showDeleteDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = { Text("Supprimer le message") },
            text = { Text("Voulez-vous vraiment supprimer ce message ?") },
            confirmButton = {
                TextButton(
                    onClick = {
                        showDeleteDialog = false
                        onDelete?.invoke()
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

// URL regex pattern
private val urlPattern = Regex(
    """(https?://[^\s<>"{}|\\^`\[\]]+)""",
    RegexOption.IGNORE_CASE
)

// Link color for URLs
private val LinkColor = Color(0xFF1976D2)

@Composable
private fun TextMessageContent(
    content: String,
    onLongPress: (() -> Unit)? = null
) {
    val context = LocalContext.current
    val layoutResult = remember { mutableStateOf<androidx.compose.ui.text.TextLayoutResult?>(null) }

    val annotatedString = buildAnnotatedString {
        var lastIndex = 0
        val textStyle = SpanStyle(color = MessageTextColor)
        val linkStyle = SpanStyle(
            color = LinkColor,
            textDecoration = TextDecoration.Underline
        )

        urlPattern.findAll(content).forEach { matchResult ->
            val start = matchResult.range.first
            val end = matchResult.range.last + 1

            // Add text before the URL
            if (start > lastIndex) {
                withStyle(textStyle) {
                    append(content.substring(lastIndex, start))
                }
            }

            // Add the URL with annotation
            val url = matchResult.value
            pushStringAnnotation(tag = "URL", annotation = url)
            withStyle(linkStyle) {
                append(url)
            }
            pop()

            lastIndex = end
        }

        // Add remaining text after last URL
        if (lastIndex < content.length) {
            withStyle(textStyle) {
                append(content.substring(lastIndex))
            }
        }
    }

    // Use Text with pointerInput to handle both tap (URLs) and long press (delete)
    Text(
        text = annotatedString,
        style = MaterialTheme.typography.bodyMedium,
        onTextLayout = { layoutResult.value = it },
        modifier = Modifier.pointerInput(onLongPress) {
            detectTapGestures(
                onTap = { offset ->
                    // Find which character was tapped
                    layoutResult.value?.let { layout ->
                        val position = layout.getOffsetForPosition(offset)
                        annotatedString.getStringAnnotations(tag = "URL", start = position, end = position)
                            .firstOrNull()?.let { annotation ->
                                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(annotation.item))
                                context.startActivity(intent)
                            }
                    }
                },
                onLongPress = {
                    onLongPress?.invoke()
                }
            )
        }
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
private fun FullscreenImageDialog(
    imageUrl: String,
    onDismiss: () -> Unit,
    onDownload: () -> Unit
) {
    var scale by remember { mutableFloatStateOf(1f) }
    var offset by remember { mutableStateOf(Offset.Zero) }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            decorFitsSystemWindows = false
        )
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black)
                .pointerInput(Unit) {
                    detectTapGestures(
                        onDoubleTap = {
                            // Double tap to reset zoom or zoom in
                            if (scale > 1f) {
                                scale = 1f
                                offset = Offset.Zero
                            } else {
                                scale = 2.5f
                            }
                        },
                        onTap = {
                            // Single tap to close only if not zoomed
                            if (scale <= 1f) {
                                onDismiss()
                            }
                        }
                    )
                }
        ) {
            val imageModifier = Modifier
                .fillMaxSize()
                .pointerInput(Unit) {
                    detectTransformGestures { _, pan, zoom, _ ->
                        scale = (scale * zoom).coerceIn(1f, 5f)
                        if (scale > 1f) {
                            val maxOffset = (scale - 1f) * size.width / 2
                            offset = Offset(
                                x = (offset.x + pan.x).coerceIn(-maxOffset, maxOffset),
                                y = (offset.y + pan.y).coerceIn(-maxOffset, maxOffset)
                            )
                        } else {
                            offset = Offset.Zero
                        }
                    }
                }
                .graphicsLayer(
                    scaleX = scale,
                    scaleY = scale,
                    translationX = offset.x,
                    translationY = offset.y
                )

            if (imageUrl.startsWith("data:")) {
                // Base64 data URL
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
                            contentDescription = "Image fullscreen",
                            modifier = imageModifier,
                            contentScale = ContentScale.Fit
                        )
                    }
                }
            } else {
                // HTTP URL
                AsyncImage(
                    model = imageUrl,
                    contentDescription = "Image fullscreen",
                    modifier = imageModifier,
                    contentScale = ContentScale.Fit
                )
            }

            // Download button (top-left)
            IconButton(
                onClick = onDownload,
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(16.dp)
                    .background(
                        color = Color.Black.copy(alpha = 0.5f),
                        shape = CircleShape
                    )
            ) {
                Icon(
                    imageVector = Icons.Default.Download,
                    contentDescription = "Telecharger l'image",
                    tint = Color.White
                )
            }

            // Close button (top-right)
            IconButton(
                onClick = onDismiss,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(16.dp)
                    .background(
                        color = Color.Black.copy(alpha = 0.5f),
                        shape = CircleShape
                    )
            ) {
                Icon(
                    imageVector = Icons.Default.Close,
                    contentDescription = "Close",
                    tint = Color.White
                )
            }
        }
    }
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
