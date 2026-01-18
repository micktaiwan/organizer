package com.organizer.chat.ui.screens.eko.components

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.unit.dp
import com.organizer.chat.ui.screens.eko.EkoAnimatedState
import com.organizer.chat.ui.screens.eko.EkoConfig
import kotlin.math.min

/**
 * Pure data class for drawing - no mutable state, preview-friendly
 */
data class EkoDrawParams(
    val breathingScale: Float = 1f,
    val touchScale: Float = 1f,
    val mouthOpenness: Float = 0f,
    val eyeOpenness: Float = 1f,
    val smileAmount: Float = 1f,
    val pupilOffset: Offset = Offset.Zero,
    val tiltOffset: Offset = Offset.Zero,
    val bodyRotation: Float = 0f,
    val gyroPupilOffset: Offset = Offset.Zero,
    val isLaughing: Boolean = false,
    val fingerPosition: Offset? = null
)

/**
 * Convert animated state to draw params
 */
fun EkoAnimatedState.toDrawParams() = EkoDrawParams(
    breathingScale = breathingScale,
    touchScale = touchScale,
    mouthOpenness = mouthOpenness,
    eyeOpenness = eyeOpenness,
    smileAmount = smileAmount,
    pupilOffset = pupilOffset,
    tiltOffset = tiltOffset,
    bodyRotation = bodyRotation,
    gyroPupilOffset = gyroPupilOffset,
    isLaughing = isLaughing,
    fingerPosition = state.fingerPosition
)

/**
 * Main entry point for drawing the creature (from animated state)
 */
fun DrawScope.drawCreature(animState: EkoAnimatedState) {
    drawCreature(animState.toDrawParams())
}

/**
 * Main entry point for drawing the creature (from draw params - preview friendly)
 */
fun DrawScope.drawCreature(params: EkoDrawParams) {
    // Apply tilt offset from accelerometer
    val center = Offset(
        size.width / 2 + params.tiltOffset.x,
        size.height / 2 + params.tiltOffset.y
    )
    val scale = params.breathingScale * params.touchScale

    // Apply body rotation from Y tilt
    rotate(degrees = params.bodyRotation, pivot = center) {
        drawBody(center, scale)
        drawEyes(center, scale, params)
        if (params.isLaughing) {
            drawLaughingTears(center, scale)
        }
        drawMouth(center, scale, params.mouthOpenness, params.smileAmount, params.isLaughing)
    }
    drawFingerCursor(params.fingerPosition)
}

/**
 * Draw the main body circle with highlight
 */
private fun DrawScope.drawBody(center: Offset, scale: Float) {
    val radius = EkoConfig.bodyRadius.toPx() * scale

    // Main body
    drawCircle(
        color = EkoConfig.bodyColor,
        radius = radius,
        center = center
    )

    // Subtle highlight
    drawCircle(
        color = Color.White.copy(alpha = EkoConfig.highlightAlpha),
        radius = radius * 0.7f,
        center = Offset(center.x - radius * 0.2f, center.y - radius * 0.25f)
    )
}

/**
 * Draw eyes with pupils that follow touch
 */
private fun DrawScope.drawEyes(center: Offset, scale: Float, params: EkoDrawParams) {
    val eyeOffsetX = EkoConfig.eyeOffsetX.toPx() * scale
    val eyeOffsetY = EkoConfig.eyeOffsetY.toPx() * scale
    val eyeRadius = EkoConfig.eyeRadius.toPx() * scale
    val pupilRadius = EkoConfig.pupilRadius.toPx() * scale

    val leftEyeCenter = Offset(center.x - eyeOffsetX, center.y - eyeOffsetY)
    val rightEyeCenter = Offset(center.x + eyeOffsetX, center.y - eyeOffsetY)

    // Laughing eyes - happy curved arcs pointing UP (only when isLaughing)
    if (params.isLaughing) {
        val lineWidth = eyeRadius * 1.8f
        val lineHeight = eyeRadius * 0.7f
        val strokeWidth = eyeRadius * 0.35f
        // Left eye - arc curving upward (happy squint)
        drawArc(
            color = EkoConfig.pupilColor,
            startAngle = 180f,
            sweepAngle = 180f,
            useCenter = false,
            topLeft = Offset(leftEyeCenter.x - lineWidth / 2, leftEyeCenter.y - lineHeight),
            size = Size(lineWidth, lineHeight * 2),
            style = Stroke(width = strokeWidth, cap = StrokeCap.Round)
        )
        // Right eye - arc curving upward (happy squint)
        drawArc(
            color = EkoConfig.pupilColor,
            startAngle = 180f,
            sweepAngle = 180f,
            useCenter = false,
            topLeft = Offset(rightEyeCenter.x - lineWidth / 2, rightEyeCenter.y - lineHeight),
            size = Size(lineWidth, lineHeight * 2),
            style = Stroke(width = strokeWidth, cap = StrokeCap.Round)
        )
        return
    }

    // Normal eyes
    drawCircle(color = Color.White, radius = eyeRadius, center = leftEyeCenter)
    drawCircle(color = Color.White, radius = eyeRadius, center = rightEyeCenter)

    // Eyelids (when blinking)
    if (params.eyeOpenness < 1f) {
        drawEyelids(leftEyeCenter, rightEyeCenter, eyeRadius, params.eyeOpenness)
    }

    // Pupils (only when eyes are mostly open)
    if (params.eyeOpenness > 0.3f) {
        drawPupils(leftEyeCenter, rightEyeCenter, pupilRadius, params)
    }
}

/**
 * Draw eyelids for blinking/squinting effect
 * When eyeOpenness is low, eyelids close from both top AND bottom (squinting)
 */
private fun DrawScope.drawEyelids(
    leftEyeCenter: Offset,
    rightEyeCenter: Offset,
    eyeRadius: Float,
    eyeOpenness: Float
) {
    val closedAmount = 1f - eyeOpenness

    // Top eyelid (comes down)
    drawArc(
        color = EkoConfig.bodyColor,
        startAngle = 0f,
        sweepAngle = 180f,
        useCenter = true,
        topLeft = Offset(
            leftEyeCenter.x - eyeRadius,
            leftEyeCenter.y - eyeRadius + (eyeRadius * 2 * closedAmount * 0.6f)
        ),
        size = Size(eyeRadius * 2, eyeRadius * 2)
    )
    drawArc(
        color = EkoConfig.bodyColor,
        startAngle = 0f,
        sweepAngle = 180f,
        useCenter = true,
        topLeft = Offset(
            rightEyeCenter.x - eyeRadius,
            rightEyeCenter.y - eyeRadius + (eyeRadius * 2 * closedAmount * 0.6f)
        ),
        size = Size(eyeRadius * 2, eyeRadius * 2)
    )

    // Bottom eyelid (comes up) - for squinting effect
    if (closedAmount > 0.3f) {
        val bottomClosedAmount = (closedAmount - 0.3f) / 0.7f  // Starts after 30% closed
        drawArc(
            color = EkoConfig.bodyColor,
            startAngle = 180f,
            sweepAngle = 180f,
            useCenter = true,
            topLeft = Offset(
                leftEyeCenter.x - eyeRadius,
                leftEyeCenter.y - eyeRadius - (eyeRadius * 2 * bottomClosedAmount * 0.5f)
            ),
            size = Size(eyeRadius * 2, eyeRadius * 2)
        )
        drawArc(
            color = EkoConfig.bodyColor,
            startAngle = 180f,
            sweepAngle = 180f,
            useCenter = true,
            topLeft = Offset(
                rightEyeCenter.x - eyeRadius,
                rightEyeCenter.y - eyeRadius - (eyeRadius * 2 * bottomClosedAmount * 0.5f)
            ),
            size = Size(eyeRadius * 2, eyeRadius * 2)
        )
    }
}

/**
 * Draw pupils with shine effect
 */
private fun DrawScope.drawPupils(
    leftEyeCenter: Offset,
    rightEyeCenter: Offset,
    pupilRadius: Float,
    params: EkoDrawParams
) {
    val pupilAlpha = min(1f, params.eyeOpenness)
    // Combine touch-based pupil offset with gyro-based offset
    // Touch takes priority when finger is on screen
    val touchOffset = params.pupilOffset
    val gyroOffset = params.gyroPupilOffset
    val pupilOffset = if (params.fingerPosition != null) {
        touchOffset
    } else {
        Offset(touchOffset.x + gyroOffset.x, touchOffset.y + gyroOffset.y)
    }
    val shineRadius = EkoConfig.eyeShineRadius.toPx() * params.touchScale
    val shineOffset = EkoConfig.eyeShineOffset.toPx()

    // Left pupil
    drawCircle(
        color = EkoConfig.pupilColor.copy(alpha = pupilAlpha),
        radius = pupilRadius,
        center = Offset(leftEyeCenter.x + pupilOffset.x, leftEyeCenter.y + pupilOffset.y)
    )
    // Right pupil
    drawCircle(
        color = EkoConfig.pupilColor.copy(alpha = pupilAlpha),
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
 * smileAmount: -1 = sad (frown), 0 = neutral, 1 = smile, 2 = big smile
 */
private fun DrawScope.drawMouth(center: Offset, scale: Float, mouthOpenness: Float, smileAmount: Float, isLaughing: Boolean = false) {
    val mouthY = center.y + EkoConfig.mouthOffsetY.toPx() * scale
    val mouthWidth = EkoConfig.mouthWidth.toPx() * scale
    val mouthHeight = EkoConfig.mouthClosedHeight.toPx() +
            (EkoConfig.mouthOpenHeight.toPx() * mouthOpenness)

    if (mouthOpenness > 0.1f) {
        if (isLaughing || smileAmount > 1.5f) {
            // Laughing mouth - wide smile shape with opening
            val laughMouthWidth = mouthWidth * 2.2f
            val laughMouthHeight = mouthHeight * 1.3f

            // Tongue first (behind mouth) - rounded tip
            val tongueWidth = laughMouthWidth * 0.38f
            val tongueHeight = laughMouthHeight * 1.4f
            val tongueY = mouthY + laughMouthHeight * 0.15f
            // Main tongue body
            drawOval(
                color = Color(0xFFE53935),
                topLeft = Offset(center.x - tongueWidth / 2, tongueY),
                size = Size(tongueWidth, tongueHeight * 0.7f)
            )
            // Rounded tip at bottom
            drawOval(
                color = Color(0xFFE53935),
                topLeft = Offset(center.x - tongueWidth * 0.4f, tongueY + tongueHeight * 0.45f),
                size = Size(tongueWidth * 0.8f, tongueHeight * 0.55f)
            )
            // Tongue highlight
            drawOval(
                color = Color.White.copy(alpha = 0.3f),
                topLeft = Offset(center.x - tongueWidth / 4, tongueY + tongueHeight * 0.1f),
                size = Size(tongueWidth / 2, tongueHeight * 0.25f)
            )

            // Draw open smile (half ellipse) - covers top of tongue
            drawArc(
                color = EkoConfig.pupilColor.copy(alpha = 0.85f),
                startAngle = 0f,
                sweepAngle = 180f,
                useCenter = true,
                topLeft = Offset(center.x - laughMouthWidth / 2, mouthY - laughMouthHeight * 0.3f),
                size = Size(laughMouthWidth, laughMouthHeight)
            )
        } else {
            // Surprised mouth - round "O" shape
            drawOval(
                color = EkoConfig.pupilColor.copy(alpha = 0.7f),
                topLeft = Offset(center.x - mouthWidth / 2, mouthY - mouthHeight / 2),
                size = Size(mouthWidth, mouthHeight)
            )

            // Tongue when very open
            if (mouthOpenness > 0.5f) {
                drawOval(
                    color = EkoConfig.tongueColor.copy(alpha = mouthOpenness * 0.6f),
                    topLeft = Offset(center.x - mouthWidth / 3, mouthY),
                    size = Size(mouthWidth / 1.5f, mouthHeight / 2)
                )
            }
        }
    } else {
        // Closed mouth - shape depends on smileAmount
        val baseArcHeight = 20.dp.toPx() * scale
        val arcHeight = baseArcHeight * smileAmount.coerceIn(0.5f, 2f)

        if (smileAmount < 0) {
            // Sad - frown (inverted arc)
            drawArc(
                color = EkoConfig.pupilColor.copy(alpha = 0.5f),
                startAngle = 200f,
                sweepAngle = 140f,
                useCenter = false,
                topLeft = Offset(center.x - mouthWidth / 2, mouthY - baseArcHeight / 2),
                size = Size(mouthWidth, baseArcHeight * (-smileAmount).coerceIn(0.5f, 1.5f))
            )
        } else {
            // Happy/neutral - smile arc
            val sweepAngle = 100f + (smileAmount * 30f).coerceIn(0f, 60f)  // 100° to 160°
            val startAngle = (180f - sweepAngle) / 2  // Center the arc

            drawArc(
                color = EkoConfig.pupilColor.copy(alpha = 0.5f),
                startAngle = startAngle,
                sweepAngle = sweepAngle,
                useCenter = false,
                topLeft = Offset(center.x - mouthWidth / 2, mouthY - arcHeight / 2),
                size = Size(mouthWidth, arcHeight)
            )
        }
    }
}

/**
 * Draw tears of joy when laughing - curved outward like 😂
 */
private fun DrawScope.drawLaughingTears(center: Offset, scale: Float) {
    val eyeOffsetX = EkoConfig.eyeOffsetX.toPx() * scale
    val eyeOffsetY = EkoConfig.eyeOffsetY.toPx() * scale
    val tearColor = Color(0xFF42A5F5)  // Bright sky blue

    // Tear size
    val tearWidth = 12.dp.toPx() * scale
    val tearHeight = 38.dp.toPx() * scale
    val tearOffsetX = eyeOffsetX + 18.dp.toPx() * scale
    val tearOffsetY = eyeOffsetY - 5.dp.toPx() * scale

    // Left tear - rotated outward (positive = clockwise = leaning right from eye)
    val leftTearCenterX = center.x - tearOffsetX
    val leftTearCenterY = center.y - tearOffsetY
    rotate(degrees = 35f, pivot = Offset(leftTearCenterX, leftTearCenterY)) {
        // Teardrop: bulb at bottom, tapers up
        drawOval(
            color = tearColor,
            topLeft = Offset(leftTearCenterX - tearWidth / 2, leftTearCenterY + tearHeight * 0.25f),
            size = Size(tearWidth, tearHeight * 0.55f)
        )
        drawOval(
            color = tearColor,
            topLeft = Offset(leftTearCenterX - tearWidth * 0.35f, leftTearCenterY),
            size = Size(tearWidth * 0.7f, tearHeight * 0.5f)
        )
        // Highlight
        drawOval(
            color = Color.White.copy(alpha = 0.6f),
            topLeft = Offset(leftTearCenterX - tearWidth * 0.15f, leftTearCenterY + tearHeight * 0.35f),
            size = Size(tearWidth * 0.25f, tearHeight * 0.15f)
        )
    }

    // Right tear - rotated outward (negative = counter-clockwise = leaning left from eye)
    val rightTearCenterX = center.x + tearOffsetX
    val rightTearCenterY = center.y - tearOffsetY
    rotate(degrees = -35f, pivot = Offset(rightTearCenterX, rightTearCenterY)) {
        drawOval(
            color = tearColor,
            topLeft = Offset(rightTearCenterX - tearWidth / 2, rightTearCenterY + tearHeight * 0.25f),
            size = Size(tearWidth, tearHeight * 0.55f)
        )
        drawOval(
            color = tearColor,
            topLeft = Offset(rightTearCenterX - tearWidth * 0.35f, rightTearCenterY),
            size = Size(tearWidth * 0.7f, tearHeight * 0.5f)
        )
        // Highlight
        drawOval(
            color = Color.White.copy(alpha = 0.6f),
            topLeft = Offset(rightTearCenterX + tearWidth * 0.05f, rightTearCenterY + tearHeight * 0.35f),
            size = Size(tearWidth * 0.25f, tearHeight * 0.15f)
        )
    }
}

/**
 * Draw subtle cheek blush
 */
private fun DrawScope.drawBlush(center: Offset, scale: Float, mouthOpenness: Float) {
    val eyeOffsetX = EkoConfig.eyeOffsetX.toPx() * scale
    val blushRadius = EkoConfig.blushRadius.toPx() * scale
    val blushOffsetX = EkoConfig.blushOffsetX.toPx()
    val blushAlpha = EkoConfig.blushBaseAlpha + (mouthOpenness * EkoConfig.blushTouchAlpha)

    drawCircle(
        color = EkoConfig.blushColor.copy(alpha = blushAlpha),
        radius = blushRadius,
        center = Offset(center.x - eyeOffsetX - blushOffsetX, center.y + 5.dp.toPx())
    )
    drawCircle(
        color = EkoConfig.blushColor.copy(alpha = blushAlpha),
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
            color = EkoConfig.cursorColor.copy(alpha = EkoConfig.cursorAlpha),
            radius = EkoConfig.cursorRadius.toPx(),
            center = pos
        )
    }
}
