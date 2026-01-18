package com.organizer.chat.util

import android.app.Activity
import android.content.pm.ActivityInfo
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.platform.LocalContext

/**
 * Lock screen orientation to portrait while this composable is in the composition.
 * Restores previous orientation when leaving.
 */
@Composable
fun LockScreenOrientation(orientation: Int = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT) {
    val context = LocalContext.current
    val activity = context as? Activity ?: return

    DisposableEffect(Unit) {
        val originalOrientation = activity.requestedOrientation
        activity.requestedOrientation = orientation

        onDispose {
            activity.requestedOrientation = originalOrientation
        }
    }
}

/**
 * Allow screen to rotate freely while this composable is in the composition.
 * Restores previous orientation when leaving.
 */
@Composable
fun AllowScreenRotation() {
    LockScreenOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR)
}
