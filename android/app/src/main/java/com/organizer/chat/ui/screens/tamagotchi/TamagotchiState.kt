package com.organizer.chat.ui.screens.tamagotchi

import androidx.compose.animation.core.*
import androidx.compose.runtime.*
import androidx.compose.ui.geometry.Offset
import kotlinx.coroutines.delay
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin

/**
 * State holder for Tamagotchi animations and interactions
 */
class TamagotchiState {
    // Touch state
    var isTouched by mutableStateOf(false)
        private set
    var fingerPosition by mutableStateOf<Offset?>(null)
        private set

    // Pupil target (will be animated)
    var targetPupilOffset by mutableStateOf(Offset.Zero)
        private set

    // Blink state
    var isBlinking by mutableStateOf(false)

    /**
     * Called when user touches the screen
     */
    fun onTouch(position: Offset, canvasCenter: Offset) {
        fingerPosition = position
        updatePupilDirection(position, canvasCenter)
    }

    /**
     * Called when user taps (touch + release)
     */
    fun onTap() {
        isTouched = true
    }

    /**
     * Called when touch ends
     */
    fun onTouchEnd() {
        fingerPosition = null
    }

    /**
     * Reset touch state after animation
     */
    fun resetTouch() {
        isTouched = false
    }

    /**
     * Calculate pupil direction based on touch position
     */
    private fun updatePupilDirection(touchPosition: Offset, canvasCenter: Offset) {
        val dx = touchPosition.x - canvasCenter.x
        val dy = touchPosition.y - canvasCenter.y
        val angle = atan2(dy, dx)
        val maxOffset = TamagotchiConfig.pupilMaxOffset

        targetPupilOffset = Offset(
            cos(angle) * maxOffset,
            sin(angle) * maxOffset
        )
    }
}

@Composable
fun rememberTamagotchiState(): TamagotchiState {
    val state = remember { TamagotchiState() }

    // Breathing animation
    val infiniteTransition = rememberInfiniteTransition(label = "breathing")
    val breathingScale by infiniteTransition.animateFloat(
        initialValue = TamagotchiConfig.breathingMin,
        targetValue = TamagotchiConfig.breathingMax,
        animationSpec = infiniteRepeatable(
            animation = tween(TamagotchiConfig.breathingDurationMs, easing = EaseInOutSine),
            repeatMode = RepeatMode.Reverse
        ),
        label = "breathingScale"
    )

    // Touch scale animation
    val touchScale by animateFloatAsState(
        targetValue = if (state.isTouched) TamagotchiConfig.touchScaleMax else 1f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessLow
        ),
        label = "touchScale"
    )

    // Mouth animation
    val mouthOpenness by animateFloatAsState(
        targetValue = if (state.isTouched) 1f else 0f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessMedium
        ),
        label = "mouthOpenness"
    )

    // Eye blink animation
    val eyeOpenness by animateFloatAsState(
        targetValue = if (state.isBlinking) 0.1f else 1f,
        animationSpec = tween(100),
        label = "eyeOpenness"
    )

    // Pupil follow animation
    val pupilOffsetX by animateFloatAsState(
        targetValue = state.targetPupilOffset.x,
        animationSpec = spring(stiffness = Spring.StiffnessLow),
        label = "pupilX"
    )
    val pupilOffsetY by animateFloatAsState(
        targetValue = state.targetPupilOffset.y,
        animationSpec = spring(stiffness = Spring.StiffnessLow),
        label = "pupilY"
    )

    // Random blink effect
    LaunchedEffect(Unit) {
        while (true) {
            delay((TamagotchiConfig.blinkIntervalMin..TamagotchiConfig.blinkIntervalMax).random())
            state.isBlinking = true
            delay(TamagotchiConfig.blinkDurationMs)
            state.isBlinking = false
        }
    }

    // Reset touch after animation
    LaunchedEffect(state.isTouched) {
        if (state.isTouched) {
            delay(TamagotchiConfig.touchResetDelayMs)
            state.resetTouch()
        }
    }

    return remember(
        state,
        breathingScale,
        touchScale,
        mouthOpenness,
        eyeOpenness,
        pupilOffsetX,
        pupilOffsetY
    ) {
        TamagotchiAnimatedState(
            state = state,
            breathingScale = breathingScale,
            touchScale = touchScale,
            mouthOpenness = mouthOpenness,
            eyeOpenness = eyeOpenness,
            pupilOffset = Offset(pupilOffsetX, pupilOffsetY)
        )
    }.state.also {
        // Update animated values in a side-effect free way through composition
    }
}

/**
 * Holds both the mutable state and the current animated values
 */
data class TamagotchiAnimatedState(
    val state: TamagotchiState,
    val breathingScale: Float,
    val touchScale: Float,
    val mouthOpenness: Float,
    val eyeOpenness: Float,
    val pupilOffset: Offset
)

@Composable
fun rememberTamagotchiAnimatedState(): TamagotchiAnimatedState {
    val state = remember { TamagotchiState() }

    // Breathing animation
    val infiniteTransition = rememberInfiniteTransition(label = "breathing")
    val breathingScale by infiniteTransition.animateFloat(
        initialValue = TamagotchiConfig.breathingMin,
        targetValue = TamagotchiConfig.breathingMax,
        animationSpec = infiniteRepeatable(
            animation = tween(TamagotchiConfig.breathingDurationMs, easing = EaseInOutSine),
            repeatMode = RepeatMode.Reverse
        ),
        label = "breathingScale"
    )

    // Touch scale animation
    val touchScale by animateFloatAsState(
        targetValue = if (state.isTouched) TamagotchiConfig.touchScaleMax else 1f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessLow
        ),
        label = "touchScale"
    )

    // Mouth animation
    val mouthOpenness by animateFloatAsState(
        targetValue = if (state.isTouched) 1f else 0f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessMedium
        ),
        label = "mouthOpenness"
    )

    // Eye blink animation
    val eyeOpenness by animateFloatAsState(
        targetValue = if (state.isBlinking) 0.1f else 1f,
        animationSpec = tween(100),
        label = "eyeOpenness"
    )

    // Pupil follow animation
    val pupilOffsetX by animateFloatAsState(
        targetValue = state.targetPupilOffset.x,
        animationSpec = spring(stiffness = Spring.StiffnessLow),
        label = "pupilX"
    )
    val pupilOffsetY by animateFloatAsState(
        targetValue = state.targetPupilOffset.y,
        animationSpec = spring(stiffness = Spring.StiffnessLow),
        label = "pupilY"
    )

    // Random blink effect
    LaunchedEffect(Unit) {
        while (true) {
            delay((TamagotchiConfig.blinkIntervalMin..TamagotchiConfig.blinkIntervalMax).random())
            state.isBlinking = true
            delay(TamagotchiConfig.blinkDurationMs)
            state.isBlinking = false
        }
    }

    // Reset touch after animation
    LaunchedEffect(state.isTouched) {
        if (state.isTouched) {
            delay(TamagotchiConfig.touchResetDelayMs)
            state.resetTouch()
        }
    }

    return TamagotchiAnimatedState(
        state = state,
        breathingScale = breathingScale,
        touchScale = touchScale,
        mouthOpenness = mouthOpenness,
        eyeOpenness = eyeOpenness,
        pupilOffset = Offset(pupilOffsetX, pupilOffsetY)
    )
}
