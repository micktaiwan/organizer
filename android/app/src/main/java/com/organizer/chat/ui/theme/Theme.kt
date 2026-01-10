package com.organizer.chat.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

// Colors - Charcoal theme
val Charcoal = Color(0xFF2D2D2D)
val CharcoalLight = Color(0xFF3D3D3D)
val CharcoalDark = Color(0xFF1D1D1D)
val AccentBlue = Color(0xFF6B9FFF)

// Chat specific colors
val MessageSent = Color(0xFFDCF8C6)
val MessageReceived = Color(0xFFFFFFFF)
val OnlineGreen = Color(0xFF4CAF50)
val OfflineGray = Color(0xFF9E9E9E)

private val DarkColorScheme = darkColorScheme(
    primary = Charcoal,
    secondary = CharcoalLight,
    tertiary = AccentBlue,
    background = CharcoalDark,
    surface = Charcoal,
    surfaceVariant = CharcoalLight,
    onPrimary = Color.White,
    onSecondary = Color.White,
    onTertiary = Color.White,
    onBackground = Color.White,
    onSurface = Color.White,
)

private val LightColorScheme = lightColorScheme(
    primary = Charcoal,
    secondary = CharcoalLight,
    tertiary = AccentBlue,
    background = Color(0xFFF5F5F5),
    surface = Color.White,
    onPrimary = Color.White,
    onSecondary = Color.White,
    onTertiary = Color.White,
    onBackground = Color.Black,
    onSurface = Color.Black,
)

@Composable
fun OrganizerChatTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = colorScheme.primary.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        content = content
    )
}
