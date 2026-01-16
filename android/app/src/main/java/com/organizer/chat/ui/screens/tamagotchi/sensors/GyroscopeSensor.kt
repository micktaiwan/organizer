package com.organizer.chat.ui.screens.tamagotchi.sensors

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext

/**
 * State holder for gyroscope values (angular velocity in rad/s)
 */
class GyroscopeState {
    // Rotation rates around each axis
    var rotationX by mutableFloatStateOf(0f)
        private set
    var rotationY by mutableFloatStateOf(0f)
        private set
    var rotationZ by mutableFloatStateOf(0f)
        private set

    // Accumulated rotation for Z axis (for eye tracking)
    var accumulatedZ by mutableFloatStateOf(0f)
        private set

    private var lastUpdateTime = 0L
    private val decayFactor = 0.95f // Decay to prevent drift

    fun update(x: Float, y: Float, z: Float) {
        rotationX = x
        rotationY = y
        rotationZ = z

        val currentTime = System.currentTimeMillis()
        if (lastUpdateTime > 0) {
            val dt = (currentTime - lastUpdateTime) / 1000f
            // Accumulate Z rotation with decay to prevent drift
            accumulatedZ = (accumulatedZ + z * dt) * decayFactor
            // Clamp to reasonable range
            accumulatedZ = accumulatedZ.coerceIn(-1f, 1f)
        }
        lastUpdateTime = currentTime
    }
}

/**
 * Composable that provides gyroscope state
 */
@Composable
fun rememberGyroscopeState(): GyroscopeState {
    val context = LocalContext.current
    val state = remember { GyroscopeState() }

    DisposableEffect(Unit) {
        val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
        val gyroscope = sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE)

        val listener = object : SensorEventListener {
            override fun onSensorChanged(event: SensorEvent) {
                if (event.sensor.type == Sensor.TYPE_GYROSCOPE) {
                    state.update(event.values[0], event.values[1], event.values[2])
                }
            }

            override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
                // Not needed
            }
        }

        gyroscope?.let {
            sensorManager.registerListener(
                listener,
                it,
                SensorManager.SENSOR_DELAY_GAME
            )
        }

        onDispose {
            sensorManager.unregisterListener(listener)
        }
    }

    return state
}
