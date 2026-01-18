package com.organizer.chat.ui.screens.tamagotchi

import androidx.compose.animation.core.*
import androidx.compose.runtime.*
import androidx.compose.ui.geometry.Offset
import kotlinx.coroutines.delay
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin

/**
 * Parameters for facial expressions
 */
data class ExpressionParams(
    val eyeOpenness: Float,
    val mouthOpenness: Float,
    val smileAmount: Float = 1f  // 0 = neutral, 1 = normal smile, 2 = big smile
)

/**
 * Map expression name to facial parameters
 */
fun String.toExpressionParams(): ExpressionParams = when (this) {
    "happy" -> ExpressionParams(1.0f, 0.0f, 2f)      // Eyes open, big closed smile
    "laughing" -> ExpressionParams(0.3f, 0.8f, 2f)   // Squinted eyes, open laughing mouth
    "surprised" -> ExpressionParams(1.0f, 0.7f, 0f)  // Wide eyes, "O" mouth
    "sad" -> ExpressionParams(0.7f, 0.0f, -1f)       // Half-closed eyes, frown
    "sleepy" -> ExpressionParams(0.2f, 0.0f, 0.5f)   // Nearly closed eyes
    "curious" -> ExpressionParams(1.0f, 0.0f, 1.2f)  // Open eyes, slight smile
    "thinking" -> ExpressionParams(0.5f, 0.0f, 0.5f) // Half-closed eyes, neutral
    else -> ExpressionParams(1.0f, 0.0f, 1f)         // neutral - normal smile
}

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
    val smileAmount: Float = 1f,       // Smile curve: -1 = sad, 0 = neutral, 1 = smile, 2 = big smile
    val pupilOffset: Offset,
    val tiltOffset: Offset = Offset.Zero,
    val isShaking: Boolean = false,
    val bodyRotation: Float = 0f,      // Rotation angle in degrees (from Y tilt)
    val gyroPupilOffset: Offset = Offset.Zero  // Eye tracking from Z rotation
)

@Composable
fun rememberTamagotchiAnimatedState(
    roll: Float = 0f,      // Tilt left/right in degrees (-180 to +180)
    pitch: Float = 0f,     // Tilt forward/back in degrees (-90 to +90)
    gyroZ: Float = 0f,     // Gyroscope Z rotation speed (rad/s) for eye tracking
    isShaking: Boolean = false,
    expression: String = "neutral"  // Current facial expression
): TamagotchiAnimatedState {
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

    // Touch scale animation (also triggered by shake)
    val touchScale by animateFloatAsState(
        targetValue = when {
            isShaking -> TamagotchiConfig.shakeScaleMax
            state.isTouched -> TamagotchiConfig.touchScaleMax
            else -> 1f
        },
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessLow
        ),
        label = "touchScale"
    )

    // Expression parameters (from API response or thinking state)
    val expressionParams = remember(expression) { expression.toExpressionParams() }

    // Mouth animation - expression takes priority over touch/shake
    val mouthOpenness by animateFloatAsState(
        targetValue = when {
            expression != "neutral" -> expressionParams.mouthOpenness
            state.isTouched || isShaking -> 1f
            else -> 0f
        },
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessMedium
        ),
        label = "mouthOpenness"
    )

    // Eye animation - expression takes priority, then blink
    val eyeOpenness by animateFloatAsState(
        targetValue = when {
            state.isBlinking -> 0.1f
            expression != "neutral" -> expressionParams.eyeOpenness
            else -> 1f
        },
        animationSpec = tween(100),
        label = "eyeOpenness"
    )

    // Smile amount animation - controls smile curve
    val smileAmount by animateFloatAsState(
        targetValue = when {
            expression != "neutral" -> expressionParams.smileAmount
            state.isTouched || isShaking -> 2f  // Big smile when touched
            else -> 1f  // Normal smile
        },
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessMedium
        ),
        label = "smileAmount"
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

    // Tilt offset animation (from rotation vector)
    // roll = tilt left/right, pitch = tilt forward/back
    val maxOffset = TamagotchiConfig.maxTiltOffset.value
    val sensitivity = TamagotchiConfig.tiltSensitivity

    // Roll: positive = tilted right, so pet slides right (same direction)
    val targetTiltX = (roll * sensitivity / 9f).coerceIn(-maxOffset, maxOffset)
    // Pitch: positive = tilted back (screen up), negative = tilted forward
    val targetTiltY = (-pitch * sensitivity / 4f).coerceIn(-maxOffset, maxOffset)  // More sensitive

    val animatedTiltX by animateFloatAsState(
        targetValue = targetTiltX,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioLowBouncy,
            stiffness = Spring.StiffnessLow
        ),
        label = "tiltX"
    )
    val animatedTiltY by animateFloatAsState(
        targetValue = targetTiltY,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioLowBouncy,
            stiffness = Spring.StiffnessLow
        ),
        label = "tiltY"
    )

    // Body rotation from roll (already in degrees)
    // Pet head stays upright by rotating opposite to phone tilt
    val targetRotation = -roll  // Direct angle in degrees

    val animatedBodyRotation by animateFloatAsState(
        targetValue = targetRotation,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessLow
        ),
        label = "bodyRotation"
    )

    // Eye tracking from gyroscope Z (rotation speed around vertical axis)
    // When showing phone to someone, eyes follow the movement
    val gyroEyeSensitivity = TamagotchiConfig.gyroEyeSensitivity
    val maxPupilOffset = TamagotchiConfig.pupilMaxOffset
    // gyroZ is in rad/s, multiply by sensitivity
    val targetGyroEyeX = (gyroZ * gyroEyeSensitivity).coerceIn(-maxPupilOffset, maxPupilOffset)

    val animatedGyroEyeX by animateFloatAsState(
        targetValue = targetGyroEyeX,
        animationSpec = spring(stiffness = Spring.StiffnessLow),
        label = "gyroEyeX"
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
        smileAmount = smileAmount,
        pupilOffset = Offset(pupilOffsetX, pupilOffsetY),
        tiltOffset = Offset(animatedTiltX, animatedTiltY),
        isShaking = isShaking,
        bodyRotation = animatedBodyRotation,
        gyroPupilOffset = Offset(animatedGyroEyeX, 0f)
    )
}
