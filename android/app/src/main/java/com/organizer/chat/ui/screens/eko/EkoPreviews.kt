package com.organizer.chat.ui.screens.eko

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.organizer.chat.ui.screens.eko.components.EkoDrawParams
import com.organizer.chat.ui.screens.eko.components.drawCreature
import com.organizer.chat.ui.theme.Charcoal

/**
 * Helper to create draw params from expression name
 */
private fun expressionToParams(expression: String): EkoDrawParams {
    val params = expression.toExpressionParams()
    return EkoDrawParams(
        eyeOpenness = params.eyeOpenness,
        mouthOpenness = params.mouthOpenness,
        smileAmount = params.smileAmount,
        isLaughing = params.isLaughing
    )
}

@Composable
private fun EkoPreviewBox(params: EkoDrawParams) {
    Box(
        modifier = Modifier
            .size(250.dp)
            .background(Charcoal)
    ) {
        Canvas(modifier = Modifier.size(250.dp)) {
            drawCreature(params)
        }
    }
}

// ============ EXPRESSION PREVIEWS ============

@Preview(name = "Neutral", showBackground = true)
@Composable
private fun PreviewNeutral() {
    EkoPreviewBox(expressionToParams("neutral"))
}

@Preview(name = "Happy", showBackground = true)
@Composable
private fun PreviewHappy() {
    EkoPreviewBox(expressionToParams("happy"))
}

@Preview(name = "Laughing", showBackground = true)
@Composable
private fun PreviewLaughing() {
    EkoPreviewBox(expressionToParams("laughing"))
}

@Preview(name = "Surprised", showBackground = true)
@Composable
private fun PreviewSurprised() {
    EkoPreviewBox(expressionToParams("surprised"))
}

@Preview(name = "Sad", showBackground = true)
@Composable
private fun PreviewSad() {
    EkoPreviewBox(expressionToParams("sad"))
}

@Preview(name = "Sleepy", showBackground = true)
@Composable
private fun PreviewSleepy() {
    EkoPreviewBox(expressionToParams("sleepy"))
}

@Preview(name = "Curious", showBackground = true)
@Composable
private fun PreviewCurious() {
    EkoPreviewBox(expressionToParams("curious"))
}

@Preview(name = "Thinking", showBackground = true)
@Composable
private fun PreviewThinking() {
    EkoPreviewBox(expressionToParams("thinking"))
}

// ============ SPECIAL STATE PREVIEWS ============

@Preview(name = "Touched (big smile)", showBackground = true)
@Composable
private fun PreviewTouched() {
    EkoPreviewBox(
        EkoDrawParams(
            touchScale = 1.25f,
            mouthOpenness = 1f,
            smileAmount = 2f
        )
    )
}

@Preview(name = "Blinking", showBackground = true)
@Composable
private fun PreviewBlinking() {
    EkoPreviewBox(
        EkoDrawParams(eyeOpenness = 0.1f)
    )
}
