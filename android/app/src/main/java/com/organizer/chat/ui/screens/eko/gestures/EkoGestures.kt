package com.organizer.chat.ui.screens.eko.gestures

import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.pointerInput
import com.organizer.chat.ui.screens.eko.EkoState

/**
 * Modifier extension for Eko touch interactions
 */
fun Modifier.ekoGestures(
    state: EkoState,
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
