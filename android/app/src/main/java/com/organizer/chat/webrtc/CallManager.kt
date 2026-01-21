package com.organizer.chat.webrtc

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.util.Log
import androidx.core.content.ContextCompat
import com.organizer.chat.data.socket.SocketManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.webrtc.*

class CallManager(
    private val context: Context,
    private val socketManager: SocketManager
) : WebRTCClient.PeerConnectionObserver {

    companion object {
        private const val TAG = "CallManager"
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var webRTCClient: WebRTCClient? = null
    private var isCleaningUp = false

    // Buffer for WebRTC signaling that arrives before we accept the call
    private var pendingOffer: String? = null
    private var pendingOfferFrom: String? = null
    private val pendingIceCandidates = mutableListOf<PendingIceCandidate>()
    private val candidatesLock = Any() // Thread safety for pendingIceCandidates
    private var isRemoteDescriptionSet = false // Track if we can add ICE candidates

    private data class PendingIceCandidate(
        val candidate: String,
        val sdpMid: String?,
        val sdpMLineIndex: Int
    )

    private val _callState = MutableStateFlow<CallState>(CallState.Idle)
    val callState: StateFlow<CallState> = _callState.asStateFlow()

    private val _remoteVideoTrack = MutableStateFlow<VideoTrack?>(null)
    val remoteVideoTrack: StateFlow<VideoTrack?> = _remoteVideoTrack.asStateFlow()

    private val _remoteAudioTrack = MutableStateFlow<AudioTrack?>(null)
    val remoteAudioTrack: StateFlow<AudioTrack?> = _remoteAudioTrack.asStateFlow()

    private val _localVideoTrack = MutableStateFlow<VideoTrack?>(null)
    val localVideoTrack: StateFlow<VideoTrack?> = _localVideoTrack.asStateFlow()

    private val _isRemoteCameraEnabled = MutableStateFlow(true)
    val isRemoteCameraEnabled: StateFlow<Boolean> = _isRemoteCameraEnabled.asStateFlow()

    fun startCall(targetUserId: String, targetUsername: String, withCamera: Boolean) {
        Log.d(TAG, "Starting call to $targetUserId ($targetUsername) withCamera=$withCamera")

        _callState.value = CallState.Calling(targetUserId, targetUsername, withCamera)

        // Send call request via socket
        socketManager.requestCall(targetUserId, withCamera)

        // Initialize WebRTC
        initializeWebRTC(withCamera)
    }

    fun acceptCall(withCamera: Boolean) {
        val incomingState = _callState.value as? CallState.Incoming ?: return
        Log.d(TAG, "Accepting call from ${incomingState.fromUserId}")

        _callState.value = CallState.Connected(
            remoteUserId = incomingState.fromUserId,
            remoteUsername = incomingState.fromUsername,
            withCamera = withCamera
        )

        // Send accept via socket
        socketManager.acceptCall(incomingState.fromUserId, withCamera)

        // Initialize WebRTC
        initializeWebRTC(withCamera)

        // Process any buffered signaling
        processPendingSignaling(incomingState.fromUserId)
    }

    private fun processPendingSignaling(fromUserId: String) {
        // Process buffered offer (ICE candidates will be processed after setRemoteDescription succeeds)
        val offer = pendingOffer
        val offerFrom = pendingOfferFrom
        pendingOffer = null
        pendingOfferFrom = null

        if (offer != null && offerFrom == fromUserId) {
            Log.d(TAG, "Processing buffered offer")
            processOfferWithPendingCandidates(fromUserId, offer)
        } else {
            // No offer, but process any pending candidates
            processPendingIceCandidates()
        }
    }

    private fun processPendingIceCandidates() {
        synchronized(candidatesLock) {
            if (pendingIceCandidates.isNotEmpty()) {
                Log.d(TAG, "Processing ${pendingIceCandidates.size} buffered ICE candidates")
                pendingIceCandidates.forEach { pending ->
                    webRTCClient?.addIceCandidate(pending.candidate, pending.sdpMid ?: "", pending.sdpMLineIndex)
                }
                pendingIceCandidates.clear()
            }
        }
    }

    private fun processOfferWithPendingCandidates(from: String, offer: String) {
        scope.launch {
            try {
                Log.d(TAG, "Setting remote description...")
                webRTCClient?.setRemoteDescription(offer, SessionDescription.Type.OFFER)
                isRemoteDescriptionSet = true
                Log.d(TAG, "Remote description set successfully")

                // Now process pending ICE candidates
                processPendingIceCandidates()

                // Create and send answer
                val answer = webRTCClient?.createAnswer()
                answer?.let {
                    socketManager.sendWebRTCAnswer(from, it)
                    Log.d(TAG, "Sent WebRTC answer to $from")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to handle offer", e)
                endCall()
            }
        }
    }

    fun rejectCall() {
        val incomingState = _callState.value as? CallState.Incoming ?: return
        Log.d(TAG, "Rejecting call from ${incomingState.fromUserId}")

        socketManager.rejectCall(incomingState.fromUserId)
        _callState.value = CallState.Idle
    }

    fun endCall() {
        val currentState = _callState.value
        val remoteUserId = when (currentState) {
            is CallState.Calling -> currentState.targetUserId
            is CallState.Connected -> currentState.remoteUserId
            is CallState.Incoming -> currentState.fromUserId
            else -> null
        }

        Log.d(TAG, "Ending call with $remoteUserId")

        remoteUserId?.let {
            socketManager.endCall(it)
            socketManager.closeWebRTC(it)
        }

        cleanup()
    }

    // Handlers for socket events
    fun handleCallRequest(from: String, fromUsername: String, withCamera: Boolean) {
        Log.d(TAG, "Incoming call from $from ($fromUsername)")

        if (_callState.value != CallState.Idle) {
            Log.d(TAG, "Already in a call, rejecting")
            socketManager.rejectCall(from)
            return
        }

        _callState.value = CallState.Incoming(from, fromUsername, withCamera)
    }

    fun handleCallAccept(from: String, withCamera: Boolean) {
        val callingState = _callState.value as? CallState.Calling ?: return

        if (callingState.targetUserId != from) {
            Log.w(TAG, "Call accept from unexpected user: $from")
            return
        }

        Log.d(TAG, "Call accepted by $from")

        _callState.value = CallState.Connected(
            remoteUserId = from,
            remoteUsername = callingState.targetUsername,
            withCamera = callingState.withCamera || withCamera
        )

        // Create and send offer
        scope.launch {
            try {
                val offer = webRTCClient?.createOffer()
                offer?.let {
                    socketManager.sendWebRTCOffer(from, it)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to create offer", e)
                endCall()
            }
        }
    }

    fun handleCallReject(from: String) {
        val callingState = _callState.value as? CallState.Calling ?: return

        if (callingState.targetUserId != from) return

        Log.d(TAG, "Call rejected by $from")
        cleanup()
    }

    fun handleCallEnd(from: String) {
        Log.d(TAG, "Call ended by $from")
        // Only cleanup if we're actually in a call with this user
        val currentState = _callState.value
        val isRelevant = when (currentState) {
            is CallState.Incoming -> currentState.fromUserId == from
            is CallState.Calling -> currentState.targetUserId == from
            is CallState.Connected -> currentState.remoteUserId == from
            CallState.Idle -> false
        }
        if (isRelevant) {
            cleanup()
        }
    }

    fun handleWebRTCOffer(from: String, offer: String) {
        Log.d(TAG, "Received WebRTC offer from $from")

        // If WebRTC not initialized yet, buffer the offer
        if (webRTCClient == null) {
            Log.d(TAG, "WebRTC not ready, buffering offer")
            pendingOffer = offer
            pendingOfferFrom = from
            return
        }

        processOfferWithPendingCandidates(from, offer)
    }

    fun handleWebRTCAnswer(from: String, answer: String) {
        Log.d(TAG, "Received WebRTC answer from $from")

        scope.launch {
            try {
                webRTCClient?.setRemoteDescription(answer, SessionDescription.Type.ANSWER)
                isRemoteDescriptionSet = true
                Log.d(TAG, "Remote description set from answer")

                // Process any pending ICE candidates from remote
                processPendingIceCandidates()
            } catch (e: Exception) {
                Log.e(TAG, "Failed to handle answer", e)
                endCall()
            }
        }
    }

    fun handleIceCandidate(from: String, candidate: String, sdpMid: String?, sdpMLineIndex: Int) {
        Log.d(TAG, "Received ICE candidate from $from")

        // If WebRTC not initialized or remote description not set yet, buffer the candidate
        if (webRTCClient == null || !isRemoteDescriptionSet) {
            Log.d(TAG, "WebRTC not ready or remote description not set, buffering ICE candidate")
            synchronized(candidatesLock) {
                pendingIceCandidates.add(PendingIceCandidate(candidate, sdpMid, sdpMLineIndex))
            }
            return
        }

        webRTCClient?.addIceCandidate(candidate, sdpMid ?: "", sdpMLineIndex)
    }

    fun handleWebRTCClose(from: String) {
        Log.d(TAG, "WebRTC close from $from")
        // Only cleanup if we're actually in a call with this user
        val currentState = _callState.value
        val isRelevant = when (currentState) {
            is CallState.Incoming -> currentState.fromUserId == from
            is CallState.Calling -> currentState.targetUserId == from
            is CallState.Connected -> currentState.remoteUserId == from
            CallState.Idle -> false
        }
        if (isRelevant) {
            cleanup()
        }
    }

    fun handleRemoteCameraToggle(from: String, enabled: Boolean) {
        val currentState = _callState.value
        val isRelevant = when (currentState) {
            is CallState.Connected -> currentState.remoteUserId == from
            else -> false
        }
        if (isRelevant) {
            Log.d(TAG, "Remote camera toggled: $enabled")
            _isRemoteCameraEnabled.value = enabled
        }
    }

    fun handleCallAnsweredElsewhere() {
        val currentState = _callState.value
        if (currentState is CallState.Incoming) {
            Log.d(TAG, "Call answered on another device, dismissing")
            cleanup()
        }
    }

    private fun initializeWebRTC(withCamera: Boolean) {
        Log.d(TAG, "Initializing WebRTC")

        webRTCClient = WebRTCClient(context, this)
        webRTCClient?.initPeerConnectionFactory()
        webRTCClient?.createPeerConnection()
        webRTCClient?.startLocalAudio()

        // Only start video if we have camera permission
        val hasCameraPermission = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.CAMERA
        ) == PackageManager.PERMISSION_GRANTED

        if (withCamera && hasCameraPermission) {
            webRTCClient?.startLocalVideo(null)
            _localVideoTrack.value = webRTCClient?.getLocalVideoTrack()
        } else if (withCamera) {
            Log.w(TAG, "Camera requested but permission not granted, skipping video")
        }
    }

    fun setLocalAudioEnabled(enabled: Boolean) {
        webRTCClient?.setLocalAudioEnabled(enabled)
    }

    fun setLocalVideoEnabled(enabled: Boolean) {
        webRTCClient?.setLocalVideoEnabled(enabled)

        // Notify the remote (symmetry with Desktop)
        val remoteUserId = when (val state = _callState.value) {
            is CallState.Connected -> state.remoteUserId
            else -> null
        }
        remoteUserId?.let { socketManager.toggleCamera(it, enabled) }
    }

    fun initRemoteRenderer(renderer: SurfaceViewRenderer) {
        webRTCClient?.initRemoteRenderer(renderer)
        _remoteVideoTrack.value?.addSink(renderer)
    }

    fun initLocalRenderer(renderer: SurfaceViewRenderer) {
        webRTCClient?.initLocalRenderer(renderer)
        val track = _localVideoTrack.value
        if (track != null) {
            track.addSink(renderer)
            Log.d(TAG, "Local video track attached to renderer")
        } else {
            Log.w(TAG, "initLocalRenderer called but localVideoTrack is null")
        }
    }

    private fun cleanup() {
        if (isCleaningUp) {
            Log.d(TAG, "Already cleaning up, skipping")
            return
        }
        isCleaningUp = true
        Log.d(TAG, "Cleaning up")

        // Clear state first to update UI and trigger Compose cleanup
        _callState.value = CallState.Idle

        // Clear tracks
        _remoteVideoTrack.value = null
        _remoteAudioTrack.value = null
        _localVideoTrack.value = null
        _isRemoteCameraEnabled.value = true

        // Clear pending signaling
        pendingOffer = null
        pendingOfferFrom = null
        isRemoteDescriptionSet = false
        synchronized(candidatesLock) {
            pendingIceCandidates.clear()
        }

        // Close WebRTC client AFTER a delay to let Compose dispose the renderer first
        // This prevents crashes when the renderer tries to use disposed resources
        val client = webRTCClient
        webRTCClient = null
        scope.launch {
            kotlinx.coroutines.delay(150) // Give Compose time to clean up renderer
            try {
                client?.close()
            } catch (e: Exception) {
                Log.e(TAG, "Error closing WebRTC client", e)
            }
            isCleaningUp = false
            Log.d(TAG, "Cleanup complete")
        }
    }

    // WebRTCClient.PeerConnectionObserver implementation
    override fun onIceCandidate(candidate: IceCandidate) {
        val remoteUserId = when (val state = _callState.value) {
            is CallState.Calling -> state.targetUserId
            is CallState.Connected -> state.remoteUserId
            else -> null
        } ?: return

        // candidate.sdp can be null according to WebRTC API
        val sdp = candidate.sdp ?: return

        socketManager.sendIceCandidate(
            remoteUserId,
            sdp,
            candidate.sdpMid,
            candidate.sdpMLineIndex
        )
    }

    override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) {
        Log.d(TAG, "ICE connection state changed: $state")

        when (state) {
            PeerConnection.IceConnectionState.DISCONNECTED,
            PeerConnection.IceConnectionState.FAILED,
            PeerConnection.IceConnectionState.CLOSED -> {
                Log.d(TAG, "Connection lost, cleaning up")
                cleanup()
            }
            else -> {}
        }
    }

    override fun onAddTrack(track: MediaStreamTrack, streams: Array<out MediaStream>) {
        Log.d(TAG, "Track added: ${track.kind()}")

        when (track) {
            is VideoTrack -> {
                Log.d(TAG, "Remote video track added")
                _remoteVideoTrack.value = track
            }
            is AudioTrack -> {
                Log.d(TAG, "Remote audio track added")
                _remoteAudioTrack.value = track
                track.setEnabled(true)
            }
        }
    }

    override fun onRemoveTrack(receiver: RtpReceiver) {
        val track = receiver.track()
        Log.d(TAG, "Track removed: ${track?.kind()}")

        when (track) {
            is VideoTrack -> {
                Log.d(TAG, "Remote video track removed")
                _remoteVideoTrack.value = null
            }
            is AudioTrack -> {
                Log.d(TAG, "Remote audio track removed")
                _remoteAudioTrack.value = null
            }
        }
    }
}
