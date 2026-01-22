package com.organizer.chat.ui.screens.call

import android.util.Log
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.filled.VideocamOff
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.automirrored.filled.VolumeOff
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.organizer.chat.audio.CallAudioManager
import com.organizer.chat.ui.theme.AccentBlue
import com.organizer.chat.webrtc.CallState
import kotlinx.coroutines.delay
import org.webrtc.RendererCommon
import org.webrtc.SurfaceViewRenderer
import org.webrtc.VideoTrack

private const val TAG = "CallScreen"

@Composable
fun CallScreen(
    callState: CallState,
    remoteVideoTrack: VideoTrack?,
    localVideoTrack: VideoTrack?,
    isMuted: Boolean,
    isCameraEnabled: Boolean,
    isRemoteCameraEnabled: Boolean,
    audioRoute: CallAudioManager.AudioRoute = CallAudioManager.AudioRoute.EARPIECE,
    onToggleMute: () -> Unit,
    onToggleCamera: () -> Unit,
    onToggleSpeaker: () -> Unit = {},
    onEndCall: () -> Unit,
    onInitRemoteRenderer: (SurfaceViewRenderer) -> Unit,
    onInitLocalRenderer: (SurfaceViewRenderer) -> Unit,
    onScreenVisible: () -> Unit = {}
) {
    // Notify that screen is now visible (for deferred camera start)
    LaunchedEffect(Unit) {
        Log.d(TAG, "CallScreen visible, calling onScreenVisible")
        onScreenVisible()
    }

    var remoteRenderer by remember { mutableStateOf<SurfaceViewRenderer?>(null) }
    var localRenderer by remember { mutableStateOf<SurfaceViewRenderer?>(null) }
    var attachedRemoteTrack by remember { mutableStateOf<VideoTrack?>(null) }
    var attachedLocalTrack by remember { mutableStateOf<VideoTrack?>(null) }

    // Call duration timer
    var callDurationSeconds by remember { mutableStateOf(0) }
    val isConnected = callState is CallState.Connected

    // Determine if this is a video call
    val withCamera = when (callState) {
        is CallState.Calling -> callState.withCamera
        is CallState.Connecting -> callState.withCamera
        is CallState.Connected -> callState.withCamera
        is CallState.Reconnecting -> callState.withCamera
        else -> false
    }

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
            try {
                track.addSink(renderer)
                attachedRemoteTrack = track
            } catch (e: Exception) {
                Log.e(TAG, "Error adding sink to remote track", e)
            }
        }

        onDispose {
            if (renderer != null && attachedRemoteTrack != null) {
                try {
                    attachedRemoteTrack?.removeSink(renderer)
                } catch (e: Exception) {
                    Log.e(TAG, "Error removing sink from remote track", e)
                }
                attachedRemoteTrack = null
            }
        }
    }

    // Attach/detach local video track to renderer when either changes
    DisposableEffect(localVideoTrack, localRenderer) {
        val renderer = localRenderer
        val track = localVideoTrack

        if (track != null && renderer != null) {
            try {
                track.addSink(renderer)
                attachedLocalTrack = track
            } catch (e: Exception) {
                Log.e(TAG, "Error adding sink to local track", e)
            }
        }

        onDispose {
            if (renderer != null && attachedLocalTrack != null) {
                try {
                    attachedLocalTrack?.removeSink(renderer)
                } catch (e: Exception) {
                    Log.e(TAG, "Error removing sink from local track", e)
                }
                attachedLocalTrack = null
            }
        }
    }

    // Release renderers on final dispose
    DisposableEffect(Unit) {
        onDispose {
            remoteRenderer?.let { renderer ->
                try {
                    attachedRemoteTrack?.removeSink(renderer)
                } catch (e: Exception) {
                    Log.e(TAG, "Error removing sink on dispose", e)
                }
                attachedRemoteTrack = null
                try {
                    renderer.release()
                } catch (e: Exception) {
                    Log.e(TAG, "Error releasing remote renderer", e)
                }
            }
            localRenderer?.let { renderer ->
                try {
                    attachedLocalTrack?.removeSink(renderer)
                } catch (e: Exception) {
                    Log.e(TAG, "Error removing local sink on dispose", e)
                }
                attachedLocalTrack = null
                try {
                    renderer.release()
                } catch (e: Exception) {
                    Log.e(TAG, "Error releasing local renderer", e)
                }
            }
        }
    }

    val hasRemoteVideo = remoteVideoTrack != null && isConnected && isRemoteCameraEnabled
    val hasLocalVideo = localVideoTrack != null && withCamera && isCameraEnabled

    // Debug logging
    Log.d(TAG, "hasRemoteVideo=$hasRemoteVideo (track=${remoteVideoTrack != null}, connected=$isConnected, remoteCamEnabled=$isRemoteCameraEnabled)")

    // Clear remote renderer when remote camera is disabled
    LaunchedEffect(isRemoteCameraEnabled) {
        if (!isRemoteCameraEnabled && remoteRenderer != null) {
            Log.d(TAG, "Remote camera disabled, clearing renderer")
            try {
                attachedRemoteTrack?.removeSink(remoteRenderer!!)
                remoteRenderer?.clearImage()
                attachedRemoteTrack = null
            } catch (e: Exception) {
                Log.e(TAG, "Error clearing remote renderer", e)
            }
        }
    }

    // Re-attach sink when remote camera is re-enabled
    LaunchedEffect(isRemoteCameraEnabled, remoteVideoTrack, remoteRenderer) {
        if (isRemoteCameraEnabled && remoteVideoTrack != null && remoteRenderer != null && attachedRemoteTrack == null) {
            Log.d(TAG, "Remote camera re-enabled, re-attaching sink")
            try {
                remoteVideoTrack.addSink(remoteRenderer!!)
                attachedRemoteTrack = remoteVideoTrack
            } catch (e: Exception) {
                Log.e(TAG, "Error re-attaching sink", e)
            }
        }
    }

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
        if (hasRemoteVideo) {
            AndroidView(
                factory = { context ->
                    SurfaceViewRenderer(context).apply {
                        setEnableHardwareScaler(true)
                        setScalingType(RendererCommon.ScalingType.SCALE_ASPECT_FIT)
                        onInitRemoteRenderer(this)
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
            if (!hasRemoteVideo) {
                val username = when (callState) {
                    is CallState.Calling -> callState.targetUsername
                    is CallState.Connecting -> callState.remoteUsername
                    is CallState.Connected -> callState.remoteUsername
                    is CallState.Reconnecting -> callState.remoteUsername
                    else -> ""
                }

                val isPulsing = callState is CallState.Calling ||
                        callState is CallState.Connecting ||
                        callState is CallState.Reconnecting

                AvatarWithPulse(
                    username = username,
                    isPulsing = isPulsing
                )

                Spacer(modifier = Modifier.height(32.dp))
            }

            // Username
            val displayName = when (callState) {
                is CallState.Calling -> callState.targetUsername
                is CallState.Connecting -> callState.remoteUsername
                is CallState.Connected -> callState.remoteUsername
                is CallState.Reconnecting -> callState.remoteUsername
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
                is CallState.Connecting -> {
                    ConnectingAnimation()
                }
                is CallState.Reconnecting -> {
                    ReconnectingAnimation()
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

            // Control buttons row
            Row(
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Mute button
                IconButton(
                    onClick = onToggleMute,
                    modifier = Modifier
                        .size(56.dp)
                        .background(
                            if (isMuted) Color(0xFFE53935) else Color.White.copy(alpha = 0.2f),
                            CircleShape
                        )
                ) {
                    Icon(
                        imageVector = if (isMuted) Icons.Default.MicOff else Icons.Default.Mic,
                        contentDescription = if (isMuted) "Activer le micro" else "Couper le micro",
                        tint = Color.White,
                        modifier = Modifier.size(24.dp)
                    )
                }

                // Speaker button (only for audio calls)
                if (!withCamera) {
                    val isSpeakerOn = audioRoute == CallAudioManager.AudioRoute.SPEAKER
                    IconButton(
                        onClick = onToggleSpeaker,
                        modifier = Modifier
                            .size(56.dp)
                            .background(
                                if (isSpeakerOn) AccentBlue else Color.White.copy(alpha = 0.2f),
                                CircleShape
                            )
                    ) {
                        Icon(
                            imageVector = if (isSpeakerOn) Icons.AutoMirrored.Filled.VolumeUp else Icons.AutoMirrored.Filled.VolumeOff,
                            contentDescription = if (isSpeakerOn) "Désactiver haut-parleur" else "Activer haut-parleur",
                            tint = Color.White,
                            modifier = Modifier.size(24.dp)
                        )
                    }
                }

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

                // Camera button (only shown for video calls)
                if (withCamera) {
                    IconButton(
                        onClick = onToggleCamera,
                        modifier = Modifier
                            .size(56.dp)
                            .background(
                                if (!isCameraEnabled) Color(0xFFE53935) else Color.White.copy(alpha = 0.2f),
                                CircleShape
                            )
                    ) {
                        Icon(
                            imageVector = if (isCameraEnabled) Icons.Default.Videocam else Icons.Default.VideocamOff,
                            contentDescription = if (isCameraEnabled) "Couper la camera" else "Activer la camera",
                            tint = Color.White,
                            modifier = Modifier.size(24.dp)
                        )
                    }
                } else {
                    // Placeholder to keep layout balanced
                    Spacer(modifier = Modifier.size(56.dp))
                }
            }
        }

        // Local video PiP (bottom right)
        if (hasLocalVideo) {
            Box(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(end = 16.dp, bottom = 140.dp)
                    .size(width = 100.dp, height = 140.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color.Black)
            ) {
                AndroidView(
                    factory = { context ->
                        SurfaceViewRenderer(context).apply {
                            setEnableHardwareScaler(true)
                            setScalingType(RendererCommon.ScalingType.SCALE_ASPECT_FIT)
                            setZOrderMediaOverlay(true) // Stay above remote video
                            onInitLocalRenderer(this)
                            localRenderer = this
                        }
                    },
                    modifier = Modifier.fillMaxSize()
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

@Composable
private fun ConnectingAnimation() {
    val infiniteTransition = rememberInfiniteTransition(label = "connectingDots")

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
        text = "Connexion$dots",
        fontSize = 16.sp,
        color = Color(0xFFFFA726).copy(alpha = 0.9f)
    )
}

@Composable
private fun ReconnectingAnimation() {
    val infiniteTransition = rememberInfiniteTransition(label = "reconnectingDots")

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
        text = "Reconnexion$dots",
        fontSize = 16.sp,
        color = Color(0xFFFF5722).copy(alpha = 0.9f)
    )
}

private fun formatDuration(seconds: Int): String {
    val minutes = seconds / 60
    val secs = seconds % 60
    return "%02d:%02d".format(minutes, secs)
}
