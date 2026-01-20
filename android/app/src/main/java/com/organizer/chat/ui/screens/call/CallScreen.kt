package com.organizer.chat.ui.screens.call

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.organizer.chat.ui.theme.AccentBlue
import com.organizer.chat.webrtc.CallManager
import com.organizer.chat.webrtc.CallState
import kotlinx.coroutines.delay
import org.webrtc.SurfaceViewRenderer
import org.webrtc.VideoTrack

@Composable
fun CallScreen(
    callState: CallState,
    remoteVideoTrack: VideoTrack?,
    callManager: CallManager,
    onEndCall: () -> Unit
) {
    var remoteRenderer by remember { mutableStateOf<SurfaceViewRenderer?>(null) }
    var attachedTrack by remember { mutableStateOf<VideoTrack?>(null) }

    // Call duration timer
    var callDurationSeconds by remember { mutableStateOf(0) }
    val isConnected = callState is CallState.Connected

    LaunchedEffect(isConnected) {
        if (isConnected) {
            callDurationSeconds = 0
            while (true) {
                delay(1000)
                callDurationSeconds++
            }
        }
    }

    // Attach/detach remote video track to renderer when either changes
    DisposableEffect(remoteVideoTrack, remoteRenderer) {
        val renderer = remoteRenderer
        val track = remoteVideoTrack

        if (track != null && renderer != null) {
            track.addSink(renderer)
            attachedTrack = track
        }

        onDispose {
            if (renderer != null && attachedTrack != null) {
                attachedTrack?.removeSink(renderer)
                attachedTrack = null
            }
        }
    }

    // Release renderer on final dispose
    DisposableEffect(Unit) {
        onDispose {
            remoteRenderer?.let { renderer ->
                attachedTrack?.removeSink(renderer)
                attachedTrack = null
                renderer.release()
            }
        }
    }

    val hasVideo = remoteVideoTrack != null && isConnected

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        Color(0xFF1a1a2e),
                        Color(0xFF16213e),
                        Color(0xFF0f0f23)
                    )
                )
            )
    ) {
        // Remote video (full screen, only when we have video)
        if (hasVideo) {
            AndroidView(
                factory = { context ->
                    SurfaceViewRenderer(context).apply {
                        setEnableHardwareScaler(true)
                        callManager.initRemoteRenderer(this)
                        remoteRenderer = this
                    }
                },
                modifier = Modifier.fillMaxSize()
            )
        }

        // Content overlay
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 24.dp)
                .padding(top = 80.dp, bottom = 48.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Avatar placeholder (hide when video is showing)
            if (!hasVideo) {
                val username = when (callState) {
                    is CallState.Calling -> callState.targetUsername
                    is CallState.Connected -> callState.remoteUsername
                    else -> ""
                }

                AvatarWithPulse(
                    username = username,
                    isPulsing = callState is CallState.Calling
                )

                Spacer(modifier = Modifier.height(32.dp))
            }

            // Username
            val displayName = when (callState) {
                is CallState.Calling -> callState.targetUsername
                is CallState.Connected -> callState.remoteUsername
                else -> ""
            }

            Text(
                text = displayName,
                fontSize = 28.sp,
                fontWeight = FontWeight.SemiBold,
                color = Color.White
            )

            Spacer(modifier = Modifier.height(8.dp))

            // Status text
            when (callState) {
                is CallState.Calling -> {
                    CallingAnimation()
                }
                is CallState.Connected -> {
                    Text(
                        text = formatDuration(callDurationSeconds),
                        fontSize = 16.sp,
                        color = Color(0xFF4CAF50)
                    )
                }
                else -> {}
            }

            Spacer(modifier = Modifier.weight(1f))

            // End call button
            IconButton(
                onClick = onEndCall,
                modifier = Modifier
                    .size(72.dp)
                    .background(Color(0xFFE53935), CircleShape)
            ) {
                Icon(
                    imageVector = Icons.Default.CallEnd,
                    contentDescription = "Raccrocher",
                    tint = Color.White,
                    modifier = Modifier.size(32.dp)
                )
            }
        }
    }
}

@Composable
private fun AvatarWithPulse(
    username: String,
    isPulsing: Boolean
) {
    val infiniteTransition = rememberInfiniteTransition(label = "pulse")

    val pulseScale by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 1.15f,
        animationSpec = infiniteRepeatable(
            animation = tween(1000, easing = EaseInOut),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulseScale"
    )

    val pulseAlpha by infiniteTransition.animateFloat(
        initialValue = 0.6f,
        targetValue = 0.2f,
        animationSpec = infiniteRepeatable(
            animation = tween(1000, easing = EaseInOut),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulseAlpha"
    )

    Box(contentAlignment = Alignment.Center) {
        // Pulse ring (only when calling)
        if (isPulsing) {
            Box(
                modifier = Modifier
                    .size((120 * pulseScale).dp)
                    .alpha(pulseAlpha)
                    .background(AccentBlue, CircleShape)
            )
        }

        // Avatar circle
        Box(
            modifier = Modifier
                .size(120.dp)
                .background(
                    Brush.linearGradient(
                        colors = listOf(AccentBlue, Color(0xFF5B8DEE))
                    ),
                    CircleShape
                ),
            contentAlignment = Alignment.Center
        ) {
            val initial = username.firstOrNull()?.uppercaseChar() ?: '?'
            Text(
                text = initial.toString(),
                fontSize = 48.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White
            )
        }
    }
}

@Composable
private fun CallingAnimation() {
    val infiniteTransition = rememberInfiniteTransition(label = "dots")

    val dotCount by infiniteTransition.animateValue(
        initialValue = 0,
        targetValue = 4,
        typeConverter = Int.VectorConverter,
        animationSpec = infiniteRepeatable(
            animation = tween(1200, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "dotCount"
    )

    val dots = ".".repeat(dotCount)

    Text(
        text = "Appel en cours$dots",
        fontSize = 16.sp,
        color = Color.White.copy(alpha = 0.7f)
    )
}

private fun formatDuration(seconds: Int): String {
    val minutes = seconds / 60
    val secs = seconds % 60
    return "%02d:%02d".format(minutes, secs)
}
