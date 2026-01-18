package com.organizer.chat.ui.screens.eko.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.organizer.chat.ui.theme.CharcoalDark
import kotlinx.coroutines.delay
import kotlin.math.sin

/**
 * TEMPORARY: Static list of thoughts for MVP testing.
 * Will be replaced by dynamic thoughts from the Agent backend.
 */
private val temporaryThoughts = listOf(
    "J'ai envie d'une glace...",
    "Je me demande ce que tu fais",
    "Tu veux jouer avec moi ?",
    "Oh, un câlin !",
    "Zzz... oh pardon je rêvais",
    "C'est quoi ton plat préféré ?",
    "Je m'ennuie un peu...",
    "Tu crois qu'il va pleuvoir ?",
    "J'aimerais bien voir la mer",
    "On est bien ici non ?"
)

/**
 * TEMPORARY: Configuration for thought bubbles.
 */
private object ThoughtBubbleConfig {
    const val intervalMinMs = 17_000L
    const val intervalMaxMs = 23_000L
    const val displayDurationMs = 2_500L
    const val paddingHorizontal = 24f
    const val paddingVertical = 16f
}

/**
 * Displays random thought bubbles with comic-style cloud design.
 *
 * TEMPORARY IMPLEMENTATION: This is a placeholder for testing the UI.
 * In the future, thoughts will come from the Agent backend.
 */
@Composable
fun ThoughtBubble(
    modifier: Modifier = Modifier,
    forcedThought: String? = null,
    thoughtKey: Int = 0,
    isThinking: Boolean = false,
    onThoughtShown: () -> Unit = {},
    onThoughtDismissed: () -> Unit = {}
) {
    var currentThought by remember { mutableStateOf<String?>(null) }
    var isVisible by remember { mutableStateOf(false) }
    var lastProcessedKey by remember { mutableStateOf(-1) }
    var isShowingForcedThought by remember { mutableStateOf(false) }
    val textMeasurer = rememberTextMeasurer()

    val textStyle = TextStyle(
        color = CharcoalDark,
        fontSize = 15.sp,
        fontWeight = FontWeight.Medium,
        textAlign = TextAlign.Center
    )

    // Animation for thinking dots
    val infiniteTransition = rememberInfiniteTransition(label = "thinking")
    val thinkingProgress by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(1200),
            repeatMode = RepeatMode.Restart
        ),
        label = "thinkingDots"
    )

    // Animation scale for bubble appearance
    val bubbleScale by animateFloatAsState(
        targetValue = if (isVisible || isThinking) 1f else 0f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessMedium
        ),
        label = "bubbleScale"
    )

    // Handle thinking state changes
    LaunchedEffect(isThinking) {
        if (isThinking) {
            // Starting to think - clear any existing thought
            isShowingForcedThought = true // Block random thoughts
            currentThought = null
            isVisible = false
        }
        // Note: when isThinking becomes false, we wait for thoughtKey to change
    }

    // Handle forced thought (from tap or API response)
    // Use both thoughtKey AND isThinking as keys to catch the transition
    LaunchedEffect(thoughtKey, isThinking) {
        // Show thought when: we have a thought, it's new, and we're not thinking
        if (forcedThought != null && thoughtKey != lastProcessedKey && !isThinking) {
            lastProcessedKey = thoughtKey
            isShowingForcedThought = true // Block random thoughts
            currentThought = forcedThought
            isVisible = true
            onThoughtShown()
            delay(ThoughtBubbleConfig.displayDurationMs)
            isVisible = false
            delay(400) // Wait for exit animation
            currentThought = null
            isShowingForcedThought = false // Allow random thoughts again
            onThoughtDismissed() // Reset expression after bubble disappears
        }
    }

    // Random thought cycle
    LaunchedEffect(Unit) {
        while (true) {
            delay((ThoughtBubbleConfig.intervalMinMs..ThoughtBubbleConfig.intervalMaxMs).random())

            // Don't interrupt forced thoughts, existing thoughts, or thinking state
            if (!isShowingForcedThought && currentThought == null && !isVisible && !isThinking) {
                currentThought = temporaryThoughts.random()
                isVisible = true
                delay(ThoughtBubbleConfig.displayDurationMs)
                // Check again before hiding - a forced thought might have started
                if (!isShowingForcedThought) {
                    isVisible = false
                    delay(400)
                    if (!isShowingForcedThought) {
                        currentThought = null
                    }
                }
            }
        }
    }

    Box(modifier = modifier.fillMaxSize()) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val thought = currentThought
            val showThinking = isThinking && bubbleScale > 0.01f
            val showThought = bubbleScale > 0.01f && thought != null && !isThinking

            if (showThinking) {
                // Draw thinking bubble with animated dots
                val creatureCenterX = size.width / 2
                val creatureCenterY = size.height / 2

                val bubbleWidth = 80.dp.toPx()
                val bubbleHeight = 50.dp.toPx()
                val bubbleX = creatureCenterX
                val bubbleY = creatureCenterY - 180.dp.toPx()

                // Draw connecting dots
                drawThoughtDots(
                    startX = creatureCenterX + 30.dp.toPx(),
                    startY = creatureCenterY - 85.dp.toPx(),
                    endX = bubbleX,
                    endY = bubbleY + bubbleHeight / 2 * bubbleScale,
                    scale = bubbleScale
                )

                // Draw cloud bubble
                drawDynamicCloudBubble(
                    centerX = bubbleX,
                    centerY = bubbleY,
                    width = bubbleWidth,
                    height = bubbleHeight,
                    scale = bubbleScale
                )

                // Draw animated thinking dots
                if (bubbleScale > 0.5f) {
                    drawThinkingDots(
                        centerX = bubbleX,
                        centerY = bubbleY,
                        progress = thinkingProgress,
                        alpha = (bubbleScale - 0.5f) * 2f
                    )
                }
            } else if (showThought) {
                val creatureCenterX = size.width / 2
                val creatureCenterY = size.height / 2

                // Measure text to determine bubble size
                val maxTextWidth = (size.width * 0.6f).toInt()
                val textLayout = textMeasurer.measure(
                    text = thought,
                    style = textStyle,
                    constraints = Constraints(maxWidth = maxTextWidth)
                )

                val textWidth = textLayout.size.width.toFloat()
                val textHeight = textLayout.size.height.toFloat()

                // Bubble dimensions based on text
                val bubbleWidth = textWidth + ThoughtBubbleConfig.paddingHorizontal * 2
                val bubbleHeight = textHeight + ThoughtBubbleConfig.paddingVertical * 2

                // Bubble position (above creature)
                val bubbleX = creatureCenterX
                val bubbleY = creatureCenterY - 180.dp.toPx()

                // Draw connecting dots
                drawThoughtDots(
                    startX = creatureCenterX + 30.dp.toPx(),
                    startY = creatureCenterY - 85.dp.toPx(),
                    endX = bubbleX,
                    endY = bubbleY + bubbleHeight / 2 * bubbleScale,
                    scale = bubbleScale
                )

                // Draw cloud bubble (dynamic size)
                drawDynamicCloudBubble(
                    centerX = bubbleX,
                    centerY = bubbleY,
                    width = bubbleWidth,
                    height = bubbleHeight,
                    scale = bubbleScale
                )

                // Draw text
                if (bubbleScale > 0.5f) {
                    drawText(
                        textLayoutResult = textLayout,
                        color = CharcoalDark.copy(alpha = (bubbleScale - 0.5f) * 2f),
                        topLeft = Offset(
                            bubbleX - textWidth / 2,
                            bubbleY - textHeight / 2
                        )
                    )
                }
            }
        }
    }
}

/**
 * Draw the small connecting dots between creature and bubble
 */
private fun DrawScope.drawThoughtDots(
    startX: Float,
    startY: Float,
    endX: Float,
    endY: Float,
    scale: Float
) {
    val dotSizes = listOf(5.dp.toPx(), 8.dp.toPx(), 12.dp.toPx())

    for (i in dotSizes.indices) {
        val progress = (i + 1).toFloat() / (dotSizes.size + 1)
        val x = startX + (endX - startX) * progress
        val y = startY + (endY - startY) * progress
        val dotScale = scale * (0.3f + progress * 0.7f)

        if (dotScale > 0.1f) {
            drawCircle(
                color = Color.White,
                radius = dotSizes[i] * dotScale,
                center = Offset(x, y)
            )
        }
    }
}

/**
 * Draw a comic-style cloud bubble with dynamic size based on text
 */
private fun DrawScope.drawDynamicCloudBubble(
    centerX: Float,
    centerY: Float,
    width: Float,
    height: Float,
    scale: Float
) {
    if (scale < 0.1f) return

    val scaledWidth = width * scale
    val scaledHeight = height * scale

    // Base circle radius for the cloud puffs
    val puffRadius = minOf(scaledWidth, scaledHeight) * 0.35f

    // Main body - large ellipse in center
    drawOval(
        color = Color.White,
        topLeft = Offset(centerX - scaledWidth / 2, centerY - scaledHeight / 2),
        size = androidx.compose.ui.geometry.Size(scaledWidth, scaledHeight)
    )

    // Corner puffs to make it look like a cloud
    val puffPositions = listOf(
        // Top puffs
        Offset(-scaledWidth * 0.35f, -scaledHeight * 0.3f),
        Offset(scaledWidth * 0.35f, -scaledHeight * 0.3f),
        Offset(0f, -scaledHeight * 0.4f),
        // Bottom puffs
        Offset(-scaledWidth * 0.35f, scaledHeight * 0.25f),
        Offset(scaledWidth * 0.35f, scaledHeight * 0.25f),
        // Side puffs
        Offset(-scaledWidth * 0.45f, 0f),
        Offset(scaledWidth * 0.45f, 0f),
    )

    puffPositions.forEach { offset ->
        drawCircle(
            color = Color.White,
            radius = puffRadius,
            center = Offset(centerX + offset.x, centerY + offset.y)
        )
    }
}

/**
 * Draw animated thinking dots (three dots that bounce sequentially)
 */
private fun DrawScope.drawThinkingDots(
    centerX: Float,
    centerY: Float,
    progress: Float,
    alpha: Float
) {
    val dotRadius = 5.dp.toPx()
    val spacing = 14.dp.toPx()
    val bounceHeight = 6.dp.toPx()

    for (i in 0..2) {
        // Each dot bounces at a different phase
        val phase = (progress + i * 0.33f) % 1f
        val bounce = sin(phase * Math.PI.toFloat() * 2) * bounceHeight
        val dotAlpha = if (phase < 0.5f) alpha else alpha * 0.5f

        drawCircle(
            color = CharcoalDark.copy(alpha = dotAlpha),
            radius = dotRadius,
            center = Offset(
                centerX + (i - 1) * spacing,
                centerY - bounce.coerceAtLeast(0f)
            )
        )
    }
}

/**
 * Trigger a random thought (called on tap)
 */
fun getRandomThought(): String = temporaryThoughts.random()
