package com.organizer.chat.ui.screens.tamagotchi.gestures

import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.pointerInput
import com.organizer.chat.ui.screens.tamagotchi.TamagotchiState

/**
 * Modifier extension for Tamagotchi touch interactions
 */
fun Modifier.tamagotchiGestures(
    state: TamagotchiState,
    getCanvasCenter: () -> Offset,
    onTap: () -> Unit = {}
): Modifier = this
    .pointerInput(Unit) {
        detectTapGestures(
            onPress = { offset ->
                val center = getCanvasCenter()
                state.onTouch(offset, center)
                tryAwaitRelease()
                state.onTouchEnd()
            },
            onTap = {
                state.onTap()
                onTap()
            }
        )
    }
    .pointerInput(Unit) {
        detectDragGestures(
            onDragStart = { offset ->
                val center = getCanvasCenter()
                state.onTouch(offset, center)
            },
            onDrag = { change, _ ->
                val center = getCanvasCenter()
                state.onTouch(change.position, center)
            },
            onDragEnd = {
                state.onTouchEnd()
            },
            onDragCancel = {
                state.onTouchEnd()
            }
        )
    }
