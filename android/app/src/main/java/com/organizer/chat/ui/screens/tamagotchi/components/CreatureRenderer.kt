package com.organizer.chat.ui.screens.tamagotchi.components

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.unit.dp
import com.organizer.chat.ui.screens.tamagotchi.TamagotchiAnimatedState
import com.organizer.chat.ui.screens.tamagotchi.TamagotchiConfig
import kotlin.math.min

/**
 * Main entry point for drawing the creature
 */
fun DrawScope.drawCreature(animState: TamagotchiAnimatedState) {
    val center = Offset(size.width / 2, size.height / 2)
    val scale = animState.breathingScale * animState.touchScale

    drawBody(center, scale)
    drawEyes(center, scale, animState)
    drawMouth(center, scale, animState.mouthOpenness)
    drawBlush(center, scale, animState.mouthOpenness)
    drawFingerCursor(animState.state.fingerPosition)
}

/**
 * Draw the main body circle with highlight
 */
private fun DrawScope.drawBody(center: Offset, scale: Float) {
    val radius = TamagotchiConfig.bodyRadius.toPx() * scale

    // Main body
    drawCircle(
        color = TamagotchiConfig.bodyColor,
        radius = radius,
        center = center
    )

    // Subtle highlight
    drawCircle(
        color = Color.White.copy(alpha = TamagotchiConfig.highlightAlpha),
        radius = radius * 0.7f,
        center = Offset(center.x - radius * 0.2f, center.y - radius * 0.25f)
    )
}

/**
 * Draw eyes with pupils that follow touch
 */
private fun DrawScope.drawEyes(center: Offset, scale: Float, animState: TamagotchiAnimatedState) {
    val eyeOffsetX = TamagotchiConfig.eyeOffsetX.toPx() * scale
    val eyeOffsetY = TamagotchiConfig.eyeOffsetY.toPx() * scale
    val eyeRadius = TamagotchiConfig.eyeRadius.toPx() * scale
    val pupilRadius = TamagotchiConfig.pupilRadius.toPx() * scale

    val leftEyeCenter = Offset(center.x - eyeOffsetX, center.y - eyeOffsetY)
    val rightEyeCenter = Offset(center.x + eyeOffsetX, center.y - eyeOffsetY)

    // Eye whites
    drawCircle(color = Color.White, radius = eyeRadius, center = leftEyeCenter)
    drawCircle(color = Color.White, radius = eyeRadius, center = rightEyeCenter)

    // Eyelids (when blinking)
    if (animState.eyeOpenness < 1f) {
        drawEyelids(leftEyeCenter, rightEyeCenter, eyeRadius, animState.eyeOpenness)
    }

    // Pupils (only when eyes are mostly open)
    if (animState.eyeOpenness > 0.3f) {
        drawPupils(leftEyeCenter, rightEyeCenter, pupilRadius, animState)
    }
}

/**
 * Draw eyelids for blinking effect
 */
private fun DrawScope.drawEyelids(
    leftEyeCenter: Offset,
    rightEyeCenter: Offset,
    eyeRadius: Float,
    eyeOpenness: Float
) {
    val closedAmount = 1f - eyeOpenness

    drawArc(
        color = TamagotchiConfig.bodyColor,
        startAngle = 0f,
        sweepAngle = 180f,
        useCenter = true,
        topLeft = Offset(
            leftEyeCenter.x - eyeRadius,
            leftEyeCenter.y - eyeRadius + (eyeRadius * 2 * closedAmount)
        ),
        size = Size(eyeRadius * 2, eyeRadius * 2)
    )
    drawArc(
        color = TamagotchiConfig.bodyColor,
        startAngle = 0f,
        sweepAngle = 180f,
        useCenter = true,
        topLeft = Offset(
            rightEyeCenter.x - eyeRadius,
            rightEyeCenter.y - eyeRadius + (eyeRadius * 2 * closedAmount)
        ),
        size = Size(eyeRadius * 2, eyeRadius * 2)
    )
}

/**
 * Draw pupils with shine effect
 */
private fun DrawScope.drawPupils(
    leftEyeCenter: Offset,
    rightEyeCenter: Offset,
    pupilRadius: Float,
    animState: TamagotchiAnimatedState
) {
    val pupilAlpha = min(1f, animState.eyeOpenness)
    val pupilOffset = animState.pupilOffset
    val shineRadius = TamagotchiConfig.eyeShineRadius.toPx() * animState.touchScale
    val shineOffset = TamagotchiConfig.eyeShineOffset.toPx()

    // Left pupil
    drawCircle(
        color = TamagotchiConfig.pupilColor.copy(alpha = pupilAlpha),
        radius = pupilRadius,
        center = Offset(leftEyeCenter.x + pupilOffset.x, leftEyeCenter.y + pupilOffset.y)
    )
    // Right pupil
    drawCircle(
        color = TamagotchiConfig.pupilColor.copy(alpha = pupilAlpha),
        radius = pupilRadius,
        center = Offset(rightEyeCenter.x + pupilOffset.x, rightEyeCenter.y + pupilOffset.y)
    )

    // Eye shine
    drawCircle(
        color = Color.White.copy(alpha = 0.8f * pupilAlpha),
        radius = shineRadius,
        center = Offset(
            leftEyeCenter.x + pupilOffset.x - shineOffset,
            leftEyeCenter.y + pupilOffset.y - shineOffset
        )
    )
    drawCircle(
        color = Color.White.copy(alpha = 0.8f * pupilAlpha),
        radius = shineRadius,
        center = Offset(
            rightEyeCenter.x + pupilOffset.x - shineOffset,
            rightEyeCenter.y + pupilOffset.y - shineOffset
        )
    )
}

/**
 * Draw mouth - closed smile or open oval
 */
private fun DrawScope.drawMouth(center: Offset, scale: Float, mouthOpenness: Float) {
    val mouthY = center.y + TamagotchiConfig.mouthOffsetY.toPx() * scale
    val mouthWidth = TamagotchiConfig.mouthWidth.toPx() * scale
    val mouthHeight = TamagotchiConfig.mouthClosedHeight.toPx() +
            (TamagotchiConfig.mouthOpenHeight.toPx() * mouthOpenness)

    if (mouthOpenness > 0.1f) {
        // Open mouth
        drawOval(
            color = TamagotchiConfig.pupilColor.copy(alpha = 0.7f),
            topLeft = Offset(center.x - mouthWidth / 2, mouthY - mouthHeight / 2),
            size = Size(mouthWidth, mouthHeight)
        )

        // Tongue when very open
        if (mouthOpenness > 0.5f) {
            drawOval(
                color = TamagotchiConfig.tongueColor.copy(alpha = mouthOpenness * 0.6f),
                topLeft = Offset(center.x - mouthWidth / 3, mouthY),
                size = Size(mouthWidth / 1.5f, mouthHeight / 2)
            )
        }
    } else {
        // Closed smile
        drawArc(
            color = TamagotchiConfig.pupilColor.copy(alpha = 0.5f),
            startAngle = 20f,
            sweepAngle = 140f,
            useCenter = false,
            topLeft = Offset(center.x - mouthWidth / 2, mouthY - 10.dp.toPx()),
            size = Size(mouthWidth, 20.dp.toPx())
        )
    }
}

/**
 * Draw subtle cheek blush
 */
private fun DrawScope.drawBlush(center: Offset, scale: Float, mouthOpenness: Float) {
    val eyeOffsetX = TamagotchiConfig.eyeOffsetX.toPx() * scale
    val blushRadius = TamagotchiConfig.blushRadius.toPx() * scale
    val blushOffsetX = TamagotchiConfig.blushOffsetX.toPx()
    val blushAlpha = TamagotchiConfig.blushBaseAlpha + (mouthOpenness * TamagotchiConfig.blushTouchAlpha)

    drawCircle(
        color = TamagotchiConfig.blushColor.copy(alpha = blushAlpha),
        radius = blushRadius,
        center = Offset(center.x - eyeOffsetX - blushOffsetX, center.y + 5.dp.toPx())
    )
    drawCircle(
        color = TamagotchiConfig.blushColor.copy(alpha = blushAlpha),
        radius = blushRadius,
        center = Offset(center.x + eyeOffsetX + blushOffsetX, center.y + 5.dp.toPx())
    )
}

/**
 * Draw finger cursor at touch position
 */
private fun DrawScope.drawFingerCursor(position: Offset?) {
    position?.let { pos ->
        drawCircle(
            color = TamagotchiConfig.cursorColor.copy(alpha = TamagotchiConfig.cursorAlpha),
            radius = TamagotchiConfig.cursorRadius.toPx(),
            center = pos
        )
    }
}
