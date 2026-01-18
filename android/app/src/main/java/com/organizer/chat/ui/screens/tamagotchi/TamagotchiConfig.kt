package com.organizer.chat.ui.screens.tamagotchi

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.organizer.chat.ui.theme.AccentBlue
import com.organizer.chat.ui.theme.CharcoalDark

/**
 * Configuration constants for the Tamagotchi creature
 */
object TamagotchiConfig {
    // Body
    val bodyRadius: Dp = 100.dp
    val bodyColor: Color = AccentBlue
    val highlightAlpha: Float = 0.15f

    // Eyes
    val eyeOffsetX: Dp = 30.dp
    val eyeOffsetY: Dp = 20.dp
    val eyeRadius: Dp = 18.dp
    val pupilRadius: Dp = 9.dp
    val pupilMaxOffset: Float = 12f
    val pupilColor: Color = CharcoalDark
    val eyeShineRadius: Dp = 4.dp
    val eyeShineOffset: Dp = 3.dp

    // Mouth
    val mouthOffsetY: Dp = 30.dp
    val mouthWidth: Dp = 20.dp
    val mouthClosedHeight: Dp = 8.dp
    val mouthOpenHeight: Dp = 15.dp
    val tongueColor: Color = Color(0xFFFF8888)

    // Blush
    val blushRadius: Dp = 12.dp
    val blushOffsetX: Dp = 15.dp
    val blushColor: Color = Color(0xFFFFB6C1)
    val blushBaseAlpha: Float = 0.2f
    val blushTouchAlpha: Float = 0.15f

    // Finger cursor
    val cursorRadius: Dp = 24.dp
    val cursorColor: Color = Color.Gray
    val cursorAlpha: Float = 0.6f

    // Animations
    val breathingMin: Float = 1f
    val breathingMax: Float = 1.08f
    val breathingDurationMs: Int = 2000
    val touchScaleMax: Float = 1.25f
    val blinkIntervalMin: Long = 2000L
    val blinkIntervalMax: Long = 5000L
    val blinkDurationMs: Long = 150L
    val touchResetDelayMs: Long = 400L

    // Accelerometer
    val tiltSensitivity: Float = 15f  // Multiplier for tilt offset
    val maxTiltOffset: Dp = 120.dp    // Max distance pet can move from center
    val shakeScaleMax: Float = 1.4f   // Scale when shaking

    // Gyroscope
    val rotationSensitivity: Float = 9f    // Multiplier for X rotation angle
    val maxRotationAngle: Float = 180f     // No limit - pet always stays upright
    val gyroEyeSensitivity: Float = 8f     // Multiplier for eye tracking from Z rotation (rad/s)
}
