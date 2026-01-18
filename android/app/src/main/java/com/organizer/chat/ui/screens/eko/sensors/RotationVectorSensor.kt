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
 * State holder for rotation vector sensor values.
 * Uses Android's fused sensor (accelerometer + gyroscope + magnetometer)
 * to provide stable orientation angles.
 */
class RotationVectorState {
    // Orientation angles in degrees
    var roll by mutableFloatStateOf(0f)      // Tilt left/right (-180 to +180)
        private set
    var pitch by mutableFloatStateOf(0f)     // Tilt forward/back (-90 to +90)
        private set
    var azimuth by mutableFloatStateOf(0f)   // Rotation around vertical (-180 to +180)
        private set

    // Shake detection (still need accelerometer for this)
    var isShaking by mutableStateOf(false)
        private set

    private var lastShakeTime = 0L
    private val shakeResetDelay = 300L

    private val rotationMatrix = FloatArray(9)
    private val orientationAngles = FloatArray(3)

    fun updateRotation(rotationVector: FloatArray) {
        // Convert rotation vector to rotation matrix
        SensorManager.getRotationMatrixFromVector(rotationMatrix, rotationVector)

        // Get orientation angles from rotation matrix
        SensorManager.getOrientation(rotationMatrix, orientationAngles)

        // Convert from radians to degrees
        azimuth = Math.toDegrees(orientationAngles[0].toDouble()).toFloat()
        pitch = Math.toDegrees(orientationAngles[1].toDouble()).toFloat()
        roll = Math.toDegrees(orientationAngles[2].toDouble()).toFloat()
    }

    fun updateShake(x: Float, y: Float, z: Float) {
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
 * Composable that provides rotation vector state with fused sensor data.
 * Combines rotation vector for orientation and accelerometer for shake detection.
 */
@Composable
fun rememberRotationVectorState(): RotationVectorState {
    val context = LocalContext.current
    val state = remember { RotationVectorState() }

    DisposableEffect(Unit) {
        val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
        val rotationSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
        val accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)

        val listener = object : SensorEventListener {
            override fun onSensorChanged(event: SensorEvent) {
                when (event.sensor.type) {
                    Sensor.TYPE_ROTATION_VECTOR -> {
                        state.updateRotation(event.values)
                    }
                    Sensor.TYPE_ACCELEROMETER -> {
                        state.updateShake(event.values[0], event.values[1], event.values[2])
                    }
                }
            }

            override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
                // Not needed
            }
        }

        rotationSensor?.let {
            sensorManager.registerListener(
                listener,
                it,
                SensorManager.SENSOR_DELAY_GAME
            )
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
