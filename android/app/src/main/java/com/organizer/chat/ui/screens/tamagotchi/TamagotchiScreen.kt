package com.organizer.chat.ui.screens.tamagotchi

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import com.organizer.chat.ui.screens.tamagotchi.components.ThoughtBubble
import com.organizer.chat.ui.screens.tamagotchi.components.drawCreature
import com.organizer.chat.ui.screens.tamagotchi.components.getRandomThought
import com.organizer.chat.ui.screens.tamagotchi.gestures.tamagotchiGestures
import com.organizer.chat.ui.screens.tamagotchi.sensors.rememberGyroscopeState
import com.organizer.chat.ui.screens.tamagotchi.sensors.rememberRotationVectorState
import com.organizer.chat.ui.theme.Charcoal

@Composable
fun TamagotchiScreen() {
    // Fused rotation sensor for stable orientation
    val rotationState = rememberRotationVectorState()
    // Gyroscope for eye tracking (measures rotation speed)
    val gyroState = rememberGyroscopeState()

    val animState = rememberTamagotchiAnimatedState(
        roll = rotationState.roll,
        pitch = rotationState.pitch,
        gyroZ = gyroState.rotationZ,  // Use gyro for eyes, not azimuth
        isShaking = rotationState.isShaking
    )
    var canvasCenter by remember { mutableStateOf(Offset.Zero) }

    // State for tap-triggered thoughts
    var forcedThought by remember { mutableStateOf<String?>(null) }
    var thoughtTrigger by remember { mutableIntStateOf(0) }

    // Callback when creature is tapped
    val onCreatureTapped: () -> Unit = {
        forcedThought = getRandomThought()
        thoughtTrigger++ // Force recomposition even if same thought
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Charcoal)
    ) {
        Canvas(
            modifier = Modifier
                .fillMaxSize()
                .tamagotchiGestures(
                    state = animState.state,
                    getCanvasCenter = { canvasCenter },
                    onTap = onCreatureTapped
                )
        ) {
            canvasCenter = Offset(size.width / 2, size.height / 2)
            drawCreature(animState)
        }

        // Thought bubble overlay
        ThoughtBubble(
            modifier = Modifier.fillMaxSize(),
            forcedThought = forcedThought,
            thoughtKey = thoughtTrigger,
            onThoughtShown = { forcedThought = null }
        )
    }
}
