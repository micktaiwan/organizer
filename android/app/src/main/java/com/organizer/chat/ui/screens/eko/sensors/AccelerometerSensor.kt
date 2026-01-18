package com.organizer.chat.ui.screens.eko.sensors

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import kotlin.math.sqrt

/**
 * State holder for accelerometer values
 */
class AccelerometerState {
    // Raw tilt values (-10 to +10 typically)
    var tiltX by mutableFloatStateOf(0f)
        private set
    var tiltY by mutableFloatStateOf(0f)
        private set
    var tiltZ by mutableFloatStateOf(0f)
        private set

    // Shake detection
    var isShaking by mutableStateOf(false)
        private set

    private var lastShakeTime = 0L
    private val shakeResetDelay = 300L

    fun update(x: Float, y: Float, z: Float) {
        // x: tilt left (-) / right (+)
        // y: tilt forward (-) / backward (+)
        // z: screen up (+) / screen down (-)
        tiltX = x
        tiltY = y
        tiltZ = z

        // Detect shake based on acceleration magnitude
        val magnitude = sqrt(x * x + y * y + z * z)
        val currentTime = System.currentTimeMillis()

        if (magnitude > 18f) {
            isShaking = true
            lastShakeTime = currentTime
        } else if (currentTime - lastShakeTime > shakeResetDelay) {
            isShaking = false
        }
    }
}

/**
 * Composable that provides accelerometer state
 */
@Composable
fun rememberAccelerometerState(): AccelerometerState {
    val context = LocalContext.current
    val state = remember { AccelerometerState() }

    DisposableEffect(Unit) {
        val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
        val accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)

        val listener = object : SensorEventListener {
            override fun onSensorChanged(event: SensorEvent) {
                if (event.sensor.type == Sensor.TYPE_ACCELEROMETER) {
                    state.update(event.values[0], event.values[1], event.values[2])
                }
            }

            override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
                // Not needed
            }
        }

        accelerometer?.let {
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
