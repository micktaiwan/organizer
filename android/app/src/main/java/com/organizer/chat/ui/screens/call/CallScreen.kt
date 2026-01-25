package com.organizer.chat.ui.screens.call

import android.app.Activity
import android.content.Context
import android.util.Log
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.Cameraswitch
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.filled.VideocamOff
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.automirrored.filled.VolumeOff
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import android.content.res.Configuration
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.organizer.chat.audio.CallAudioManager
import com.organizer.chat.ui.theme.AccentBlue
import com.organizer.chat.webrtc.CallState
import kotlin.math.max
import kotlin.math.roundToInt
import kotlinx.coroutines.delay
import org.webrtc.RendererCommon
import org.webrtc.SurfaceViewRenderer
import org.webrtc.VideoFrame
import org.webrtc.VideoSink
import org.webrtc.VideoTrack

private const val TAG = "CallScreen"

@Composable
fun CallScreen(
    callState: CallState,
    remoteVideoTrack: VideoTrack?,
    remoteScreenTrack: VideoTrack? = null,
    localVideoTrack: VideoTrack?,
    isMuted: Boolean,
    isCameraEnabled: Boolean,
    isRemoteCameraEnabled: Boolean,
    isRemoteScreenSharing: Boolean = false,
    audioRoute: CallAudioManager.AudioRoute = CallAudioManager.AudioRoute.EARPIECE,
    isFrontCamera: Boolean = true,
    isInPipMode: Boolean = false,
    onToggleMute: () -> Unit,
    onToggleCamera: () -> Unit,
    onSwitchCamera: () -> Unit = {},
    onToggleSpeaker: () -> Unit = {},
    onEndCall: () -> Unit,
    onInitRemoteRenderer: (SurfaceViewRenderer) -> Unit,
    onInitScreenShareRenderer: (SurfaceViewRenderer) -> Unit = {},
    onInitLocalRenderer: (SurfaceViewRenderer) -> Unit,
    onScreenVisible: () -> Unit = {},
    onMinimize: (() -> Unit)? = null
) {
    // Keep screen on during the call
    val activity = LocalContext.current as? Activity
    DisposableEffect(Unit) {
        activity?.window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        onDispose {
            activity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    // Allow back to minimize the call when connected
    BackHandler(enabled = callState is CallState.Connected && onMinimize != null) {
        onMinimize?.invoke()
    }

    // Notify that screen is now visible (for deferred camera start)
    LaunchedEffect(Unit) {
        Log.d(TAG, "CallScreen visible, calling onScreenVisible")
        onScreenVisible()
    }

    var remoteRenderer by remember { mutableStateOf<SurfaceViewRenderer?>(null) }
    var screenShareRenderer by remember { mutableStateOf<SurfaceViewRenderer?>(null) }
    var localRenderer by remember { mutableStateOf<SurfaceViewRenderer?>(null) }
    var attachedRemoteTrack by remember { mutableStateOf<VideoTrack?>(null) }
    var attachedScreenTrack by remember { mutableStateOf<VideoTrack?>(null) }
    var attachedLocalTrack by remember { mutableStateOf<VideoTrack?>(null) }
    var screenVideoWidth by remember { mutableIntStateOf(0) }
    var screenVideoHeight by remember { mutableIntStateOf(0) }

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

    // Detect landscape orientation
    val configuration = LocalConfiguration.current
    val isLandscape = configuration.orientation == Configuration.ORIENTATION_LANDSCAPE

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

    // Attach/detach screen share track to renderer when either changes
    DisposableEffect(remoteScreenTrack, screenShareRenderer) {
        val renderer = screenShareRenderer
        val track = remoteScreenTrack
        var dimensionSink: VideoSink? = null

        if (track != null && renderer != null) {
            try {
                track.addSink(renderer)
                attachedScreenTrack = track
                // Add a lightweight sink to track video frame dimensions
                dimensionSink = VideoSink { frame: VideoFrame ->
                    val w = frame.rotatedWidth
                    val h = frame.rotatedHeight
                    if (w != screenVideoWidth || h != screenVideoHeight) {
                        screenVideoWidth = w
                        screenVideoHeight = h
                        Log.d(TAG, "ScreenShare frame dimensions: ${w}x${h} (AR=${w.toFloat()/h})")
                    }
                }
                track.addSink(dimensionSink)
            } catch (e: Exception) {
                Log.e(TAG, "Error adding sink to screen share track", e)
            }
        }

        onDispose {
            if (renderer != null && attachedScreenTrack != null) {
                try {
                    attachedScreenTrack?.removeSink(renderer)
                    dimensionSink?.let { attachedScreenTrack?.removeSink(it) }
                } catch (e: Exception) {
                    Log.e(TAG, "Error removing sink from screen share track", e)
                }
                attachedScreenTrack = null
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
            screenShareRenderer?.let { renderer ->
                try {
                    attachedScreenTrack?.removeSink(renderer)
                } catch (e: Exception) {
                    Log.e(TAG, "Error removing screen share sink on dispose", e)
                }
                attachedScreenTrack = null
                try {
                    renderer.release()
                } catch (e: Exception) {
                    Log.e(TAG, "Error releasing screen share renderer", e)
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
    val hasScreenShare = remoteScreenTrack != null && isConnected && isRemoteScreenSharing
    val hasLocalVideo = localVideoTrack != null && withCamera && isCameraEnabled

    // Hide all overlays in landscape mode during screen share (fullscreen mode) or in PiP mode
    val hideOverlays = (isLandscape && hasScreenShare) || isInPipMode

    // Enable immersive fullscreen mode when hideOverlays is true
    DisposableEffect(hideOverlays) {
        if (hideOverlays && activity != null) {
            activity.window.insetsController?.let { controller ->
                controller.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                controller.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        }
        onDispose {
            activity?.window?.insetsController?.show(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
        }
    }

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
        // Screen share video (full screen, when receiving screen share)
        if (hasScreenShare) {
            var scale by remember { mutableFloatStateOf(1f) }
            var offsetX by remember { mutableFloatStateOf(0f) }
            var offsetY by remember { mutableFloatStateOf(0f) }
            var containerWidth by remember { mutableFloatStateOf(0f) }
            var containerHeight by remember { mutableFloatStateOf(0f) }
            var initialScaleApplied by remember { mutableStateOf(false) }

            // TEST: Disabled auto-zoom - scale stays at 1
            // LaunchedEffect(screenVideoWidth, screenVideoHeight, containerWidth, containerHeight) {
            //     if (!initialScaleApplied && screenVideoWidth > 0 && screenVideoHeight > 0
            //         && containerWidth > 0 && containerHeight > 0) {
            //         val videoAR = screenVideoWidth.toFloat() / screenVideoHeight.toFloat()
            //         val containerAR = containerWidth / containerHeight
            //         val fitWidth: Float
            //         val fitHeight: Float
            //         if (videoAR > containerAR) {
            //             fitWidth = containerWidth
            //             fitHeight = containerWidth / videoAR
            //         } else {
            //             fitHeight = containerHeight
            //             fitWidth = containerHeight * videoAR
            //         }
            //         val fillScale = max(containerWidth / fitWidth, containerHeight / fitHeight)
            //         scale = fillScale.coerceAtMost(5f)
            //         initialScaleApplied = true
            //     }
            // }

            Box(
                contentAlignment = androidx.compose.ui.Alignment.Center,
                modifier = Modifier
                    .fillMaxSize()
                    .onSizeChanged { size ->
                        containerWidth = size.width.toFloat()
                        containerHeight = size.height.toFloat()
                    }
                    .pointerInput(Unit) {
                        detectTapGestures(
                            onDoubleTap = {
                                // Reset to fill scale
                                val videoAR = if (screenVideoWidth > 0 && screenVideoHeight > 0)
                                    screenVideoWidth.toFloat() / screenVideoHeight.toFloat()
                                else 16f / 9f
                                val containerAR = if (containerHeight > 0) containerWidth / containerHeight else 1f
                                val fitHeight = if (videoAR > containerAR) containerWidth / videoAR else containerHeight
                                val fitWidth = if (videoAR > containerAR) containerWidth else containerHeight * videoAR
                                val fillScale = max(containerWidth / fitWidth, containerHeight / fitHeight)
                                scale = fillScale
                                offsetX = 0f
                                offsetY = 0f
                            }
                        )
                    }
                    .pointerInput(Unit) {
                        detectTransformGestures { centroid, pan, zoom, _ ->
                            val oldScale = scale
                            val newScale = oldScale * zoom

                            // Adjust offset to keep centroid fixed during zoom
                            val centroidX = centroid.x - containerWidth / 2f
                            val centroidY = centroid.y - containerHeight / 2f
                            offsetX = (offsetX - centroidX) * (newScale / oldScale) + centroidX + pan.x
                            offsetY = (offsetY - centroidY) * (newScale / oldScale) + centroidY + pan.y

                            scale = newScale
                        }
                    }
            ) {
                AndroidView(
                    factory = { context ->
                        SurfaceViewRenderer(context).apply {
                            setEnableHardwareScaler(false)
                            onInitScreenShareRenderer(this)
                            setScalingType(RendererCommon.ScalingType.SCALE_ASPECT_FIT)
                            Log.d(TAG, "ScreenShare renderer: FIT, hardware scaler OFF")
                            screenShareRenderer = this
                            viewTreeObserver.addOnGlobalLayoutListener {
                                Log.d(TAG, "ScreenShare SurfaceView laid out: ${width}x${height}")
                            }
                        }
                    },
                    update = { view ->
                        view.scaleX = scale
                        view.scaleY = scale
                        view.translationX = offsetX
                        view.translationY = offsetY
                    },
                    modifier = if (screenVideoWidth > 0 && screenVideoHeight > 0) {
                        // Force view to video aspect ratio - eliminates scaling ambiguity
                        val videoAR = screenVideoWidth.toFloat() / screenVideoHeight.toFloat()
                        Modifier
                            .fillMaxWidth()
                            .aspectRatio(videoAR)
                    } else {
                        Modifier.fillMaxSize()
                    }
                )
            }
        }

        // Remote video - always present, changes size based on screen share state
        // (avoids destroying/recreating renderer which breaks track frame delivery)
        // Hide PIP in landscape fullscreen mode
        if (hasRemoteVideo && !(hasScreenShare && hideOverlays)) {
            var camPipOffsetX by remember { mutableFloatStateOf(0f) }
            var camPipOffsetY by remember { mutableFloatStateOf(0f) }
            var isCamPipDragging by remember { mutableStateOf(false) }

            // Reset PiP offset when transitioning back to fullscreen
            LaunchedEffect(hasScreenShare) {
                if (!hasScreenShare) {
                    camPipOffsetX = 0f
                    camPipOffsetY = 0f
                }
            }

            val remoteVideoModifier = if (hasScreenShare) {
                Modifier
                    .align(Alignment.TopEnd)
                    .padding(end = 16.dp, top = 80.dp)
                    .offset { IntOffset(camPipOffsetX.roundToInt(), camPipOffsetY.roundToInt()) }
                    .pointerInput(Unit) {
                        detectDragGestures(
                            onDragStart = { isCamPipDragging = true },
                            onDragEnd = { isCamPipDragging = false },
                            onDragCancel = { isCamPipDragging = false },
                            onDrag = { change, dragAmount ->
                                change.consume()
                                camPipOffsetX += dragAmount.x
                                camPipOffsetY += dragAmount.y
                            }
                        )
                    }
                    .size(width = 120.dp, height = 160.dp)
                    .border(
                        width = if (isCamPipDragging) 3.dp else 2.dp,
                        color = if (isCamPipDragging) Color(0xFFFFA726) else Color.White.copy(alpha = 0.6f),
                        shape = RoundedCornerShape(12.dp)
                    )
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color.Black)
            } else {
                Modifier.fillMaxSize()
            }

            Box(modifier = remoteVideoModifier) {
                AndroidView(
                    factory = { context ->
                        SurfaceViewRenderer(context).apply {
                            setEnableHardwareScaler(true)
                            setScalingType(RendererCommon.ScalingType.SCALE_ASPECT_FIT)
                            setZOrderMediaOverlay(true)
                            onInitRemoteRenderer(this)
                            remoteRenderer = this
                        }
                    },
                    modifier = Modifier.fillMaxSize()
                )
            }
        }

        // Content overlay (hidden in landscape fullscreen mode)
        if (!hideOverlays) Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 24.dp)
                .padding(top = 80.dp, bottom = 48.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Avatar placeholder (hide when video or screen share is showing)
            if (!hasRemoteVideo && !hasScreenShare) {
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
                        color = Color.White,
                        modifier = Modifier
                            .background(Color.Black.copy(alpha = 0.5f), RoundedCornerShape(12.dp))
                            .padding(horizontal = 12.dp, vertical = 4.dp)
                    )
                    if (isRemoteScreenSharing) {
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = "Partage d'écran",
                            fontSize = 13.sp,
                            color = Color.White,
                            modifier = Modifier
                                .background(AccentBlue.copy(alpha = 0.9f), RoundedCornerShape(12.dp))
                                .padding(horizontal = 10.dp, vertical = 3.dp)
                        )
                    }
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

                    // Switch camera button (only when camera is enabled)
                    if (isCameraEnabled) {
                        IconButton(
                            onClick = onSwitchCamera,
                            modifier = Modifier
                                .size(56.dp)
                                .background(
                                    Color.White.copy(alpha = 0.2f),
                                    CircleShape
                                )
                        ) {
                            Icon(
                                imageVector = Icons.Default.Cameraswitch,
                                contentDescription = if (isFrontCamera) "Caméra arrière" else "Caméra avant",
                                tint = Color.White,
                                modifier = Modifier.size(24.dp)
                            )
                        }
                    }
                } else {
                    // Placeholder to keep layout balanced
                    Spacer(modifier = Modifier.size(56.dp))
                }
            }
        }

        // Local video PiP (bottom right, draggable) - hidden during screen share and PiP mode
        if (hasLocalVideo && !hasScreenShare && !isInPipMode) {
            val context = LocalContext.current
            val prefs = remember { context.getSharedPreferences("call_pip_prefs", Context.MODE_PRIVATE) }

            var pipOffsetX by remember { mutableFloatStateOf(prefs.getFloat("pip_offset_x", 0f)) }
            var pipOffsetY by remember { mutableFloatStateOf(prefs.getFloat("pip_offset_y", 0f)) }
            var isDragging by remember { mutableStateOf(false) }

            val shadowElevation by animateDpAsState(
                targetValue = if (isDragging) 16.dp else 0.dp,
                animationSpec = tween(durationMillis = 150),
                label = "pipShadow"
            )

            Box(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(end = 16.dp, bottom = 140.dp)
                    .offset { IntOffset(pipOffsetX.roundToInt(), pipOffsetY.roundToInt()) }
                    .pointerInput(Unit) {
                        detectDragGestures(
                            onDragStart = { isDragging = true },
                            onDragEnd = {
                                isDragging = false
                                // Save position when drag ends
                                prefs.edit().putFloat("pip_offset_x", pipOffsetX).putFloat("pip_offset_y", pipOffsetY).apply()
                            },
                            onDragCancel = { isDragging = false },
                            onDrag = { change, dragAmount ->
                                change.consume()
                                pipOffsetX += dragAmount.x
                                pipOffsetY += dragAmount.y
                            }
                        )
                    }
                    .size(width = 100.dp, height = 140.dp)
                    .shadow(
                        elevation = shadowElevation,
                        shape = RoundedCornerShape(8.dp)
                    )
                    .clip(RoundedCornerShape(8.dp))
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
