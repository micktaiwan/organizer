package com.organizer.chat.ui.components

import android.media.MediaPlayer
import android.util.Base64
import android.util.Log
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.organizer.chat.data.api.ApiClient
import com.organizer.chat.ui.theme.AccentBlue
import com.organizer.chat.ui.theme.CharcoalLight
import kotlinx.coroutines.delay
import java.io.File
import java.io.FileOutputStream

// Colors matching MessageBubble theme
private val AudioTextColor = Color(0xFF1A1A1A)
private val AudioSecondaryColor = Color(0xFF666666)

/**
 * Reusable audio player component that supports both URL and base64 sources.
 *
 * @param source Audio source - can be a URL (starting with "/" or "http") or base64 data
 * @param fileName Optional filename to display
 * @param modifier Modifier for the component
 * @param compact If true, shows a compact version for message bubbles
 */
@Composable
fun AudioPlayer(
    source: String,
    fileName: String? = null,
    modifier: Modifier = Modifier,
    compact: Boolean = false
) {
    val context = LocalContext.current
    var mediaPlayer by remember { mutableStateOf<MediaPlayer?>(null) }
    var isPlaying by remember { mutableStateOf(false) }
    var isPrepared by remember { mutableStateOf(false) }
    var isLoading by remember { mutableStateOf(false) }
    var currentPosition by remember { mutableIntStateOf(0) }
    var duration by remember { mutableIntStateOf(0) }
    var error by remember { mutableStateOf<String?>(null) }

    // Unique ID for temp file based on source hash
    val sourceId = remember(source) { source.hashCode().toString() }

    // Clean up media player on dispose
    DisposableEffect(source) {
        onDispose {
            mediaPlayer?.release()
            mediaPlayer = null
        }
    }

    // Update progress while playing
    LaunchedEffect(isPlaying, mediaPlayer) {
        while (isPlaying && mediaPlayer != null) {
            try {
                currentPosition = mediaPlayer?.currentPosition ?: 0
            } catch (e: Exception) {
                // MediaPlayer may be in invalid state
            }
            delay(100)
        }
    }

    fun prepareAndPlay() {
        if (isLoading) return

        isLoading = true
        error = null

        try {
            val isUrl = source.startsWith("/") || source.startsWith("http")

            if (isUrl) {
                // URL source - play directly or from server
                val fullUrl = if (source.startsWith("/")) {
                    ApiClient.getBaseUrl().trimEnd('/') + source
                } else {
                    source
                }

                mediaPlayer = MediaPlayer().apply {
                    setDataSource(fullUrl)
                    setOnPreparedListener { mp ->
                        duration = mp.duration
                        isPrepared = true
                        isLoading = false
                        mp.start()
                        isPlaying = true
                    }
                    setOnCompletionListener {
                        isPlaying = false
                        currentPosition = 0
                    }
                    setOnErrorListener { _, what, extra ->
                        Log.e("AudioPlayer", "MediaPlayer error: what=$what, extra=$extra")
                        error = "Erreur de lecture"
                        isLoading = false
                        isPlaying = false
                        true
                    }
                    prepareAsync()
                }
            } else {
                // Base64 source - decode and play from temp file
                val base64Data = if (source.contains(",")) {
                    source.substringAfter(",")
                } else {
                    source
                }

                val audioBytes = Base64.decode(base64Data, Base64.DEFAULT)
                val tempFile = File(context.cacheDir, "audio_$sourceId.tmp")
                FileOutputStream(tempFile).use { it.write(audioBytes) }

                mediaPlayer = MediaPlayer().apply {
                    setDataSource(tempFile.absolutePath)
                    setOnPreparedListener { mp ->
                        duration = mp.duration
                        isPrepared = true
                        isLoading = false
                        mp.start()
                        isPlaying = true
                    }
                    setOnCompletionListener {
                        isPlaying = false
                        currentPosition = 0
                    }
                    setOnErrorListener { _, what, extra ->
                        Log.e("AudioPlayer", "MediaPlayer error: what=$what, extra=$extra")
                        error = "Erreur de lecture"
                        isLoading = false
                        isPlaying = false
                        true
                    }
                    prepareAsync()
                }
            }
        } catch (e: Exception) {
            Log.e("AudioPlayer", "Failed to prepare audio", e)
            error = "Impossible de lire l'audio"
            isLoading = false
        }
    }

    fun togglePlayPause() {
        if (mediaPlayer == null || !isPrepared) {
            prepareAndPlay()
        } else if (isPlaying) {
            mediaPlayer?.pause()
            isPlaying = false
        } else {
            mediaPlayer?.start()
            isPlaying = true
        }
    }

    fun seekTo(position: Float) {
        val seekPos = (position * duration).toInt()
        mediaPlayer?.seekTo(seekPos)
        currentPosition = seekPos
    }

    if (compact) {
        CompactAudioPlayer(
            isPlaying = isPlaying,
            isLoading = isLoading,
            currentPosition = currentPosition,
            duration = duration,
            error = error,
            fileName = fileName,
            onPlayPause = ::togglePlayPause,
            onSeek = ::seekTo,
            modifier = modifier
        )
    } else {
        FullAudioPlayer(
            isPlaying = isPlaying,
            isLoading = isLoading,
            currentPosition = currentPosition,
            duration = duration,
            error = error,
            fileName = fileName,
            onPlayPause = ::togglePlayPause,
            onSeek = ::seekTo,
            modifier = modifier
        )
    }
}

@Composable
private fun CompactAudioPlayer(
    isPlaying: Boolean,
    isLoading: Boolean,
    currentPosition: Int,
    duration: Int,
    error: String?,
    fileName: String?,
    onPlayPause: () -> Unit,
    onSeek: (Float) -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
    ) {
        // Play/Pause button
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .size(36.dp)
                .clip(CircleShape)
                .background(AccentBlue)
                .clickable(enabled = !isLoading) { onPlayPause() }
        ) {
            if (isLoading) {
                CircularProgressIndicator(
                    modifier = Modifier.size(20.dp),
                    color = Color.White,
                    strokeWidth = 2.dp
                )
            } else {
                Icon(
                    imageVector = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                    contentDescription = if (isPlaying) "Pause" else "Play",
                    tint = Color.White,
                    modifier = Modifier.size(20.dp)
                )
            }
        }

        Spacer(modifier = Modifier.width(8.dp))

        Column(modifier = Modifier.weight(1f)) {
            // Filename or "Audio"
            Text(
                text = fileName?.take(30) ?: "Audio",
                style = MaterialTheme.typography.bodySmall,
                color = AudioTextColor,
                maxLines = 1
            )

            if (error != null) {
                Text(
                    text = error,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    fontSize = 11.sp
                )
            } else {
                // Progress bar
                Slider(
                    value = if (duration > 0) currentPosition.toFloat() / duration else 0f,
                    onValueChange = { onSeek(it) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(20.dp),
                    colors = SliderDefaults.colors(
                        thumbColor = AccentBlue,
                        activeTrackColor = AccentBlue,
                        inactiveTrackColor = AudioSecondaryColor.copy(alpha = 0.3f)
                    )
                )
            }
        }

        Spacer(modifier = Modifier.width(8.dp))

        // Duration
        Text(
            text = formatDuration(if (isPlaying || currentPosition > 0) currentPosition else duration),
            style = MaterialTheme.typography.bodySmall,
            color = AudioSecondaryColor,
            fontSize = 11.sp
        )
    }
}

@Composable
private fun FullAudioPlayer(
    isPlaying: Boolean,
    isLoading: Boolean,
    currentPosition: Int,
    duration: Int,
    error: String?,
    fileName: String?,
    onPlayPause: () -> Unit,
    onSeek: (Float) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(CharcoalLight)
            .padding(16.dp)
    ) {
        // Header with filename
        if (fileName != null) {
            Text(
                text = fileName,
                style = MaterialTheme.typography.bodyMedium,
                color = Color.White,
                fontWeight = FontWeight.Medium,
                maxLines = 2
            )
            Spacer(modifier = Modifier.height(12.dp))
        }

        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth()
        ) {
            // Play/Pause button
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .size(48.dp)
                    .clip(CircleShape)
                    .background(AccentBlue)
                    .clickable(enabled = !isLoading) { onPlayPause() }
            ) {
                if (isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp),
                        color = Color.White,
                        strokeWidth = 2.dp
                    )
                } else {
                    Icon(
                        imageVector = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                        contentDescription = if (isPlaying) "Pause" else "Play",
                        tint = Color.White,
                        modifier = Modifier.size(28.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                if (error != null) {
                    Text(
                        text = error,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error
                    )
                } else {
                    // Progress slider
                    Slider(
                        value = if (duration > 0) currentPosition.toFloat() / duration else 0f,
                        onValueChange = { onSeek(it) },
                        modifier = Modifier.fillMaxWidth(),
                        colors = SliderDefaults.colors(
                            thumbColor = AccentBlue,
                            activeTrackColor = AccentBlue,
                            inactiveTrackColor = Color.White.copy(alpha = 0.3f)
                        )
                    )

                    // Time display
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = formatDuration(currentPosition),
                            style = MaterialTheme.typography.bodySmall,
                            color = Color.White.copy(alpha = 0.7f),
                            fontSize = 12.sp
                        )
                        Text(
                            text = formatDuration(duration),
                            style = MaterialTheme.typography.bodySmall,
                            color = Color.White.copy(alpha = 0.7f),
                            fontSize = 12.sp
                        )
                    }
                }
            }
        }
    }
}

private fun formatDuration(millis: Int): String {
    val totalSeconds = millis / 1000
    val minutes = totalSeconds / 60
    val seconds = totalSeconds % 60
    return "%d:%02d".format(minutes, seconds)
}
