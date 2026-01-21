package com.organizer.chat.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.organizer.chat.webrtc.CallManager
import com.organizer.chat.webrtc.CallState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.webrtc.VideoTrack

class CallViewModel(
    private val callManager: CallManager
) : ViewModel() {

    // Delegated states from CallManager
    val callState: StateFlow<CallState> = callManager.callState
    val remoteVideoTrack: StateFlow<VideoTrack?> = callManager.remoteVideoTrack
    val localVideoTrack: StateFlow<VideoTrack?> = callManager.localVideoTrack
    val isRemoteCameraEnabled: StateFlow<Boolean> = callManager.isRemoteCameraEnabled

    // UI-local states
    private val _isMuted = MutableStateFlow(false)
    val isMuted: StateFlow<Boolean> = _isMuted.asStateFlow()

    private val _isCameraEnabled = MutableStateFlow(true)
    val isCameraEnabled: StateFlow<Boolean> = _isCameraEnabled.asStateFlow()

    fun startCall(userId: String, username: String, withCamera: Boolean) {
        resetUIState()
        callManager.startCall(userId, username, withCamera)
    }

    fun acceptCall(withCamera: Boolean) {
        resetUIState()
        callManager.acceptCall(withCamera)
    }

    fun rejectCall() {
        callManager.rejectCall()
    }

    fun endCall() {
        callManager.endCall()
        resetUIState()
    }

    fun toggleMute() {
        val newMuted = !_isMuted.value
        _isMuted.value = newMuted
        callManager.setLocalAudioEnabled(!newMuted)
    }

    fun toggleCamera() {
        val newEnabled = !_isCameraEnabled.value
        _isCameraEnabled.value = newEnabled
        callManager.setLocalVideoEnabled(newEnabled)
    }

    fun resetUIState() {
        _isMuted.value = false
        _isCameraEnabled.value = true
    }

    fun initRemoteRenderer(renderer: org.webrtc.SurfaceViewRenderer) {
        callManager.initRemoteRenderer(renderer)
    }

    fun initLocalRenderer(renderer: org.webrtc.SurfaceViewRenderer) {
        callManager.initLocalRenderer(renderer)
    }
}

class CallViewModelFactory(
    private val callManager: CallManager
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(CallViewModel::class.java)) {
            return CallViewModel(callManager) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class")
    }
}
