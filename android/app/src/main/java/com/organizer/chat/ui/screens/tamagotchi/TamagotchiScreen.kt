package com.organizer.chat.ui.screens.tamagotchi

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.organizer.chat.ui.screens.tamagotchi.components.ThoughtBubble
import com.organizer.chat.ui.screens.tamagotchi.components.drawCreature
import com.organizer.chat.ui.screens.tamagotchi.components.getRandomThought
import com.organizer.chat.ui.screens.tamagotchi.gestures.tamagotchiGestures
import com.organizer.chat.ui.screens.tamagotchi.sensors.rememberGyroscopeState
import com.organizer.chat.ui.screens.tamagotchi.sensors.rememberRotationVectorState
import com.organizer.chat.ui.theme.AccentBlue
import com.organizer.chat.ui.theme.Charcoal

@Composable
fun TamagotchiScreen(
    viewModel: TamagotchiViewModel = viewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    // Fused rotation sensor for stable orientation
    val rotationState = rememberRotationVectorState()
    // Gyroscope for eye tracking (measures rotation speed)
    val gyroState = rememberGyroscopeState()

    // Expression: "thinking" during loading, API expression otherwise
    val currentExpression = if (uiState.isLoading) "thinking" else uiState.currentExpression

    val animState = rememberTamagotchiAnimatedState(
        roll = rotationState.roll,
        pitch = rotationState.pitch,
        gyroZ = gyroState.rotationZ,
        isShaking = rotationState.isShaking,
        expression = currentExpression
    )
    var canvasCenter by remember { mutableStateOf(Offset.Zero) }

    // State for tap-triggered thoughts (random thoughts on tap)
    var localForcedThought by remember { mutableStateOf<String?>(null) }
    var localThoughtTrigger by remember { mutableIntStateOf(0) }

    // Input state
    var questionText by remember { mutableStateOf("") }

    // Callback when creature is tapped
    val onCreatureTapped: () -> Unit = {
        localForcedThought = getRandomThought()
        localThoughtTrigger++
    }

    // Determine which thought to show (API response takes priority)
    val thoughtToShow = uiState.currentThought ?: localForcedThought
    val thoughtKey = if (uiState.currentThought != null) uiState.thoughtTrigger else localThoughtTrigger

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Charcoal)
    ) {
        // Main content area with creature and thought bubble
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
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
                forcedThought = thoughtToShow,
                thoughtKey = thoughtKey,
                isThinking = uiState.isLoading,
                onThoughtShown = {
                    localForcedThought = null
                    viewModel.clearThought()
                },
                onThoughtDismissed = {
                    viewModel.clearExpression()
                }
            )
        }

        // Input bar at bottom
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            OutlinedTextField(
                value = questionText,
                onValueChange = { questionText = it },
                placeholder = { Text("Pose une question...") },
                modifier = Modifier
                    .weight(1f),
                shape = RoundedCornerShape(24.dp),
                singleLine = true,
                enabled = !uiState.isLoading,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                keyboardActions = KeyboardActions(
                    onSend = {
                        if (questionText.isNotBlank() && !uiState.isLoading) {
                            viewModel.askQuestion(questionText)
                            questionText = ""
                        }
                    }
                ),
                colors = OutlinedTextFieldDefaults.colors(
                    cursorColor = AccentBlue,
                    focusedBorderColor = AccentBlue,
                    unfocusedBorderColor = AccentBlue.copy(alpha = 0.5f)
                )
            )

            IconButton(
                onClick = {
                    if (questionText.isNotBlank() && !uiState.isLoading) {
                        viewModel.askQuestion(questionText)
                        questionText = ""
                    }
                },
                enabled = questionText.isNotBlank() && !uiState.isLoading
            ) {
                if (uiState.isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp),
                        color = AccentBlue,
                        strokeWidth = 2.dp
                    )
                } else {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.Send,
                        contentDescription = "Envoyer",
                        tint = if (questionText.isNotBlank()) AccentBlue else AccentBlue.copy(alpha = 0.5f)
                    )
                }
            }
        }
    }
}
