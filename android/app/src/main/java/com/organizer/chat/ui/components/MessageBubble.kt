package com.organizer.chat.ui.components

import android.media.MediaPlayer
import android.util.Base64
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import java.io.File
import java.io.FileOutputStream
import com.organizer.chat.data.model.Message
import com.organizer.chat.ui.theme.MessageReceived
import com.organizer.chat.ui.theme.MessageSent
import java.text.SimpleDateFormat
import java.util.*

// Fixed colors for message bubbles (readable on both light/dark backgrounds)
private val MessageTextColor = androidx.compose.ui.graphics.Color(0xFF1A1A1A)
private val MessageSecondaryColor = androidx.compose.ui.graphics.Color(0xFF666666)

@Composable
fun MessageBubble(
    message: Message,
    isMyMessage: Boolean
) {
    val bubbleShape = if (isMyMessage) {
        RoundedCornerShape(16.dp, 16.dp, 4.dp, 16.dp)
    } else {
        RoundedCornerShape(16.dp, 16.dp, 16.dp, 4.dp)
    }

    val bubbleColor = if (isMyMessage) MessageSent else MessageReceived

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp, vertical = 2.dp),
        horizontalAlignment = if (isMyMessage) Alignment.End else Alignment.Start
    ) {
        // Show sender name for received messages
        if (!isMyMessage) {
            Text(
                text = message.senderId.displayName,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(start = 8.dp, bottom = 2.dp)
            )
        }

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
                when (message.type) {
                    "audio" -> AudioMessageContent(message.content, message.id)
                    "image" -> ImageMessageContent()
                    else -> TextMessageContent(message.content)
                }

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

@Composable
private fun TextMessageContent(content: String) {
    Text(
        text = content,
        style = MaterialTheme.typography.bodyMedium,
        color = MessageTextColor
    )
}

@Composable
private fun AudioMessageContent(base64Content: String, messageId: String) {
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
            .clickable {
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
            }
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
private fun ImageMessageContent() {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.padding(vertical = 4.dp)
    ) {
        Icon(
            imageVector = Icons.Default.Image,
            contentDescription = null,
            tint = MessageSecondaryColor,
            modifier = Modifier.size(20.dp)
        )
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            text = "Image",
            style = MaterialTheme.typography.bodyMedium,
            color = MessageTextColor
        )
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
