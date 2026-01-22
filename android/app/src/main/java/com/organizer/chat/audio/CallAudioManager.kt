package com.organizer.chat.audio

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class CallAudioManager(private val context: Context) : SensorEventListener {

    companion object {
        private const val TAG = "CallAudioManager"
    }

    enum class AudioRoute {
        EARPIECE,
        SPEAKER
    }

    private val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    private val vibrator: Vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
    } else {
        @Suppress("DEPRECATION")
        context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
    }

    private var audioFocusRequest: AudioFocusRequest? = null
    private var ringtone: Ringtone? = null
    private var isRinging = false
    private var proximitySensorEnabled = false
    private var wakeLock: PowerManager.WakeLock? = null

    private val _audioRoute = MutableStateFlow(AudioRoute.EARPIECE)
    val audioRoute: StateFlow<AudioRoute> = _audioRoute.asStateFlow()

    @Suppress("DEPRECATION")
    private var savedAudioMode: Int = AudioManager.MODE_NORMAL
    @Suppress("DEPRECATION")
    private var savedSpeakerphoneOn: Boolean = false

    @Suppress("DEPRECATION")
    fun requestAudioFocus(): Boolean {
        Log.d(TAG, "Requesting audio focus")

        // Save current audio state
        savedAudioMode = audioManager.mode
        savedSpeakerphoneOn = audioManager.isSpeakerphoneOn

        val focusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
            )
            .setAcceptsDelayedFocusGain(false)
            .setWillPauseWhenDucked(false)
            .build()

        audioFocusRequest = focusRequest

        val result = audioManager.requestAudioFocus(focusRequest)
        val success = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED

        if (success) {
            audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
            Log.d(TAG, "Audio focus granted")
        } else {
            Log.w(TAG, "Audio focus request failed: $result")
        }

        return success
    }

    @Suppress("DEPRECATION")
    fun abandonAudioFocus() {
        Log.d(TAG, "Abandoning audio focus")

        audioFocusRequest?.let {
            audioManager.abandonAudioFocusRequest(it)
            audioFocusRequest = null
        }

        // Restore previous audio state
        audioManager.mode = savedAudioMode
        audioManager.isSpeakerphoneOn = savedSpeakerphoneOn
    }

    @Suppress("DEPRECATION")
    fun setAudioRoute(route: AudioRoute) {
        Log.d(TAG, "Setting audio route: $route")
        _audioRoute.value = route

        when (route) {
            AudioRoute.EARPIECE -> {
                audioManager.isSpeakerphoneOn = false
            }
            AudioRoute.SPEAKER -> {
                audioManager.isSpeakerphoneOn = true
            }
        }
    }

    fun toggleSpeaker() {
        val newRoute = if (_audioRoute.value == AudioRoute.SPEAKER) {
            AudioRoute.EARPIECE
        } else {
            AudioRoute.SPEAKER
        }
        setAudioRoute(newRoute)
    }

    fun setDefaultRouteForCall(isVideoCall: Boolean) {
        // Video calls default to speaker, audio calls to earpiece
        val route = if (isVideoCall) AudioRoute.SPEAKER else AudioRoute.EARPIECE
        setAudioRoute(route)
        Log.d(TAG, "Default route for ${if (isVideoCall) "video" else "audio"} call: $route")
    }

    fun startRinging() {
        if (isRinging) {
            Log.d(TAG, "Already ringing")
            return
        }

        Log.d(TAG, "Starting ringtone")
        isRinging = true

        try {
            // Get default ringtone
            val ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
            ringtone = RingtoneManager.getRingtone(context, ringtoneUri)?.apply {
                audioAttributes = AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
                isLooping = true
                play()
            }

            // Start vibration pattern: vibrate 1s, pause 1s, repeat
            val pattern = longArrayOf(0, 1000, 1000)
            @Suppress("DEPRECATION")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(
                    VibrationEffect.createWaveform(pattern, 0),
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .build()
                )
            } else {
                vibrator.vibrate(pattern, 0)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error starting ringtone", e)
        }
    }

    fun stopRinging() {
        if (!isRinging) {
            return
        }

        Log.d(TAG, "Stopping ringtone")
        isRinging = false

        try {
            ringtone?.stop()
            ringtone = null
            vibrator.cancel()
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping ringtone", e)
        }
    }

    fun enableProximitySensor() {
        if (proximitySensorEnabled) return

        Log.d(TAG, "Enabling proximity sensor")
        proximitySensorEnabled = true

        // Acquire wake lock for proximity sensor
        wakeLock = powerManager.newWakeLock(
            PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK,
            "OrganizerChat::CallProximityWakeLock"
        ).apply {
            acquire()
        }

        // Register proximity sensor listener
        sensorManager.getDefaultSensor(Sensor.TYPE_PROXIMITY)?.let { sensor ->
            sensorManager.registerListener(this, sensor, SensorManager.SENSOR_DELAY_NORMAL)
        }
    }

    fun disableProximitySensor() {
        if (!proximitySensorEnabled) return

        Log.d(TAG, "Disabling proximity sensor")
        proximitySensorEnabled = false

        // Unregister sensor listener
        sensorManager.unregisterListener(this)

        // Release wake lock
        wakeLock?.let {
            if (it.isHeld) {
                it.release()
            }
        }
        wakeLock = null
    }

    fun release() {
        Log.d(TAG, "Releasing CallAudioManager")
        stopRinging()
        disableProximitySensor()
        abandonAudioFocus()
    }

    // SensorEventListener implementation
    override fun onSensorChanged(event: SensorEvent?) {
        event?.let {
            if (it.sensor.type == Sensor.TYPE_PROXIMITY) {
                val distance = it.values[0]
                val isNear = distance < it.sensor.maximumRange
                Log.d(TAG, "Proximity sensor: distance=$distance, isNear=$isNear")
                // Screen will be turned off/on automatically by the wake lock
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
        // Not used
    }
}
