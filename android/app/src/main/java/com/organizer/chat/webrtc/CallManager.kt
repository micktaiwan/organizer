package com.organizer.chat.webrtc

import android.Manifest
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.util.Log
import androidx.core.content.ContextCompat
import com.organizer.chat.audio.CallAudioManager
import com.organizer.chat.data.socket.SocketManager
import com.organizer.chat.service.CallActionCallback
import com.organizer.chat.service.CallService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.webrtc.*

enum class CallErrorType {
    TIMEOUT_NO_ANSWER,
    TIMEOUT_INCOMING,
    REJECTED,
    NETWORK_ERROR,
    PERMISSION_DENIED,
    ANSWERED_ELSEWHERE,
    UNKNOWN
}

data class CallError(
    val type: CallErrorType,
    val message: String
)

// Extension to get the remote user ID from any active call state
val CallState.remoteUserIdOrNull: String?
    get() = when (this) {
        is CallState.Calling -> targetUserId
        is CallState.Incoming -> fromUserId
        is CallState.Connecting -> remoteUserId
        is CallState.Connected -> remoteUserId
        is CallState.Reconnecting -> remoteUserId
        CallState.Idle -> null
    }

// Extension to check if a call state involves a specific user
fun CallState.involvesUser(userId: String): Boolean = remoteUserIdOrNull == userId

class CallManager(
    private val context: Context,
    private val socketManager: SocketManager
) : WebRTCClient.PeerConnectionObserver, CallActionCallback {

    companion object {
        private const val TAG = "CallManager"
        private const val OUTGOING_CALL_TIMEOUT_MS = 30_000L
        private const val INCOMING_CALL_TIMEOUT_MS = 30_000L
        private const val RECONNECT_TIMEOUT_MS = 10_000L
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var webRTCClient: WebRTCClient? = null
    private var isCleaningUp = false

    // Audio manager
    private val audioManager = CallAudioManager(context)
    val audioRoute: StateFlow<CallAudioManager.AudioRoute> = audioManager.audioRoute

    // Buffer for WebRTC signaling that arrives before we accept the call
    private var pendingOffer: String? = null
    private var pendingOfferFrom: String? = null
    private val pendingIceCandidates = mutableListOf<PendingIceCandidate>()
    private val candidatesLock = Any() // Thread safety for pendingIceCandidates
    private var isRemoteDescriptionSet = false // Track if we can add ICE candidates

    // Pending camera start (when accepting call from background)
    private var pendingCameraStart = false
    // Pending renegotiation (when track added during Connecting state)
    private var pendingRenegotiation = false

    // Timeouts
    private var outgoingCallTimeoutJob: Job? = null
    private var incomingCallTimeoutJob: Job? = null
    private var reconnectTimeoutJob: Job? = null

    private data class PendingIceCandidate(
        val candidate: String,
        val sdpMid: String?,
        val sdpMLineIndex: Int
    )

    private val _callState = MutableStateFlow<CallState>(CallState.Idle)
    val callState: StateFlow<CallState> = _callState.asStateFlow()

    private val _callError = MutableSharedFlow<CallError>(extraBufferCapacity = 1)
    val callError: SharedFlow<CallError> = _callError.asSharedFlow()

    private val _remoteVideoTrack = MutableStateFlow<VideoTrack?>(null)
    val remoteVideoTrack: StateFlow<VideoTrack?> = _remoteVideoTrack.asStateFlow()

    private val _remoteAudioTrack = MutableStateFlow<AudioTrack?>(null)
    val remoteAudioTrack: StateFlow<AudioTrack?> = _remoteAudioTrack.asStateFlow()

    private val _localVideoTrack = MutableStateFlow<VideoTrack?>(null)
    val localVideoTrack: StateFlow<VideoTrack?> = _localVideoTrack.asStateFlow()

    private val _isFrontCamera = MutableStateFlow(true)
    val isFrontCamera: StateFlow<Boolean> = _isFrontCamera.asStateFlow()

    private val _isRemoteCameraEnabled = MutableStateFlow(true)
    val isRemoteCameraEnabled: StateFlow<Boolean> = _isRemoteCameraEnabled.asStateFlow()

    private val _remoteScreenTrack = MutableStateFlow<VideoTrack?>(null)
    val remoteScreenTrack: StateFlow<VideoTrack?> = _remoteScreenTrack.asStateFlow()

    private val _isRemoteScreenSharing = MutableStateFlow(false)
    val isRemoteScreenSharing: StateFlow<Boolean> = _isRemoteScreenSharing.asStateFlow()

    private var remoteScreenTrackId: String? = null

    init {
        // Register as callback for notification actions
        CallService.setCallActionCallback(this)
    }

    fun startCall(targetUserId: String, targetUsername: String, withCamera: Boolean) {

        _callState.value = CallState.Calling(targetUserId, targetUsername, withCamera)

        // Setup audio
        audioManager.requestAudioFocus()
        audioManager.setDefaultRouteForCall(withCamera)

        // Enable proximity sensor for audio calls
        if (!withCamera) {
            audioManager.enableProximitySensor()
        }

        // Send call request via socket
        socketManager.requestCall(targetUserId, withCamera)

        // Initialize WebRTC
        initializeWebRTC(withCamera)

        // Start outgoing call timeout
        startOutgoingCallTimeout(targetUserId)

        // Start foreground service
        CallService.startActiveCall(context, targetUsername)
    }

    private fun startOutgoingCallTimeout(targetUserId: String) {
        outgoingCallTimeoutJob?.cancel()
        outgoingCallTimeoutJob = scope.launch {
            delay(OUTGOING_CALL_TIMEOUT_MS)
            val currentState = _callState.value
            if (currentState is CallState.Calling && currentState.targetUserId == targetUserId) {
                _callError.tryEmit(CallError(CallErrorType.TIMEOUT_NO_ANSWER, "Pas de réponse"))
                cleanup()
            }
        }
    }

    private fun cancelOutgoingCallTimeout() {
        outgoingCallTimeoutJob?.cancel()
        outgoingCallTimeoutJob = null
    }

    fun acceptCall(withCamera: Boolean, fromBackground: Boolean = false) {
        val incomingState = _callState.value as? CallState.Incoming ?: return

        // Cancel incoming timeout
        cancelIncomingCallTimeout()

        // Stop ringing
        audioManager.stopRinging()

        // Transition to Connecting state
        _callState.value = CallState.Connecting(
            remoteUserId = incomingState.fromUserId,
            remoteUsername = incomingState.fromUsername,
            withCamera = withCamera
        )

        // Setup audio
        audioManager.requestAudioFocus()
        audioManager.setDefaultRouteForCall(withCamera)

        // Enable proximity sensor for audio calls
        if (!withCamera) {
            audioManager.enableProximitySensor()
        }

        // Send accept via socket
        socketManager.acceptCall(incomingState.fromUserId, withCamera)

        // Initialize WebRTC - defer camera if accepting from background
        // Camera can fail silently on some devices when app is in background
        initializeWebRTC(withCamera, startCameraImmediately = !fromBackground)

        // Update service notification
        CallService.startActiveCall(context, incomingState.fromUsername)

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
            processOfferWithPendingCandidates(fromUserId, offer)
        } else {
            // No offer, but process any pending candidates
            processPendingIceCandidates()
        }
    }

    private fun processPendingIceCandidates() {
        synchronized(candidatesLock) {
            if (pendingIceCandidates.isNotEmpty()) {
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
                webRTCClient?.setRemoteDescription(offer, SessionDescription.Type.OFFER)
                isRemoteDescriptionSet = true

                // Now process pending ICE candidates
                processPendingIceCandidates()

                // Create and send answer
                val answer = webRTCClient?.createAnswer()
                answer?.let {
                    socketManager.sendWebRTCAnswer(from, it)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to handle offer", e)
                _callError.tryEmit(CallError(CallErrorType.NETWORK_ERROR, "Erreur de connexion"))
                endCall()
            }
        }
    }

    fun rejectCall() {
        val incomingState = _callState.value as? CallState.Incoming ?: return

        // Cancel incoming timeout
        cancelIncomingCallTimeout()

        // Stop ringing
        audioManager.stopRinging()

        socketManager.rejectCall(incomingState.fromUserId)

        // Stop service
        CallService.stop(context)

        _callState.value = CallState.Idle
    }

    fun endCall() {
        val remoteUserId = _callState.value.remoteUserIdOrNull

        remoteUserId?.let {
            socketManager.endCall(it)
            socketManager.closeWebRTC(it)
        }

        cleanup()
    }

    // Handlers for socket events
    fun handleCallRequest(from: String, fromUsername: String, withCamera: Boolean) {

        if (_callState.value != CallState.Idle) {
            socketManager.rejectCall(from)
            return
        }

        _callState.value = CallState.Incoming(from, fromUsername, withCamera)

        // Check Do Not Disturb mode
        val isDndActive = isDndEnabled()
        if (isDndActive) {
        } else {
            // Start ringing
            audioManager.startRinging()
        }

        // Start incoming call timeout
        startIncomingCallTimeout(from)

        // Start foreground service for incoming call notification
        CallService.startIncomingCall(context, from, fromUsername, withCamera)
    }

    private fun startIncomingCallTimeout(fromUserId: String) {
        incomingCallTimeoutJob?.cancel()
        incomingCallTimeoutJob = scope.launch {
            delay(INCOMING_CALL_TIMEOUT_MS)
            val currentState = _callState.value
            if (currentState is CallState.Incoming && currentState.fromUserId == fromUserId) {
                _callError.tryEmit(CallError(CallErrorType.TIMEOUT_INCOMING, "Appel manqué"))
                rejectCall()
            }
        }
    }

    private fun cancelIncomingCallTimeout() {
        incomingCallTimeoutJob?.cancel()
        incomingCallTimeoutJob = null
    }

    private fun isDndEnabled(): Boolean {
        return try {
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.currentInterruptionFilter != NotificationManager.INTERRUPTION_FILTER_ALL
        } catch (e: Exception) {
            Log.e(TAG, "Error checking DND status", e)
            false
        }
    }

    fun handleCallAccept(from: String, withCamera: Boolean) {
        val callingState = _callState.value as? CallState.Calling ?: return

        if (callingState.targetUserId != from) {
            Log.w(TAG, "Call accept from unexpected user: $from")
            return
        }


        // Cancel outgoing timeout
        cancelOutgoingCallTimeout()

        // Transition to Connecting state
        _callState.value = CallState.Connecting(
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
                _callError.tryEmit(CallError(CallErrorType.NETWORK_ERROR, "Erreur de connexion"))
                endCall()
            }
        }
    }

    fun handleCallReject(from: String) {
        val callingState = _callState.value as? CallState.Calling ?: return

        if (callingState.targetUserId != from) return

        cancelOutgoingCallTimeout()
        _callError.tryEmit(CallError(CallErrorType.REJECTED, "Appel refusé"))
        cleanup()
    }

    fun handleCallEnd(from: String) {
        if (_callState.value.involvesUser(from)) {
            cleanup()
        }
    }

    fun handleWebRTCOffer(from: String, offer: String) {

        // If WebRTC not initialized yet, buffer the offer
        if (webRTCClient == null) {
            pendingOffer = offer
            pendingOfferFrom = from
            return
        }

        processOfferWithPendingCandidates(from, offer)
    }

    fun handleWebRTCAnswer(from: String, answer: String) {

        scope.launch {
            try {
                webRTCClient?.setRemoteDescription(answer, SessionDescription.Type.ANSWER)
                isRemoteDescriptionSet = true

                // Process any pending ICE candidates from remote
                processPendingIceCandidates()
            } catch (e: Exception) {
                Log.e(TAG, "Failed to handle answer", e)
                _callError.tryEmit(CallError(CallErrorType.NETWORK_ERROR, "Erreur de connexion"))
                endCall()
            }
        }
    }

    fun handleIceCandidate(from: String, candidate: String, sdpMid: String?, sdpMLineIndex: Int) {

        // If WebRTC not initialized or remote description not set yet, buffer the candidate
        if (webRTCClient == null || !isRemoteDescriptionSet) {
            synchronized(candidatesLock) {
                pendingIceCandidates.add(PendingIceCandidate(candidate, sdpMid, sdpMLineIndex))
            }
            return
        }

        webRTCClient?.addIceCandidate(candidate, sdpMid ?: "", sdpMLineIndex)
    }

    fun handleWebRTCClose(from: String) {
        if (_callState.value.involvesUser(from)) {
            cleanup()
        }
    }

    fun handleRemoteCameraToggle(from: String, enabled: Boolean) {
        val currentState = _callState.value
        val isRelevant = when (currentState) {
            is CallState.Connected -> currentState.remoteUserId == from
            is CallState.Reconnecting -> currentState.remoteUserId == from
            else -> false
        }
        if (isRelevant) {
            _isRemoteCameraEnabled.value = enabled
        }
    }

    fun handleRemoteScreenShare(from: String, enabled: Boolean, trackId: String?) {
        val currentState = _callState.value
        val isRelevant = when (currentState) {
            is CallState.Connected -> currentState.remoteUserId == from
            is CallState.Reconnecting -> currentState.remoteUserId == from
            else -> false
        }
        if (!isRelevant) return

        if (enabled && trackId != null) {
            remoteScreenTrackId = trackId
            _isRemoteScreenSharing.value = true
        } else {
            remoteScreenTrackId = null
            _isRemoteScreenSharing.value = false
            _remoteScreenTrack.value = null
        }
    }

    fun handleCallAnsweredElsewhere() {
        val currentState = _callState.value
        if (currentState is CallState.Incoming) {
            cancelIncomingCallTimeout()
            audioManager.stopRinging()
            _callError.tryEmit(CallError(CallErrorType.ANSWERED_ELSEWHERE, "Appel pris sur un autre appareil"))
            CallService.stop(context)
            _callState.value = CallState.Idle
        }
    }

    private fun initializeWebRTC(withCamera: Boolean, startCameraImmediately: Boolean = true) {

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
            if (startCameraImmediately) {
                webRTCClient?.startLocalVideo(null)
                _localVideoTrack.value = webRTCClient?.getLocalVideoTrack()
                pendingCameraStart = false
            } else {
                // Defer camera start until UI is visible (e.g., accepting from notification in background)
                pendingCameraStart = true
            }
        } else if (withCamera) {
            Log.w(TAG, "Camera requested but permission not granted, skipping video")
        }
    }

    /**
     * Start the camera if it was deferred (e.g., when accepting call from background).
     * Call this when the CallScreen becomes visible.
     */
    fun startCameraIfPending() {
        if (!pendingCameraStart) {
            return
        }

        val hasCameraPermission = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.CAMERA
        ) == PackageManager.PERMISSION_GRANTED

        if (!hasCameraPermission) {
            Log.w(TAG, "startCameraIfPending: camera permission not granted")
            pendingCameraStart = false
            return
        }

        webRTCClient?.startLocalVideo(null)
        _localVideoTrack.value = webRTCClient?.getLocalVideoTrack()
        pendingCameraStart = false

        // Notify remote that our camera is now active
        _callState.value.remoteUserIdOrNull?.let {
            socketManager.toggleCamera(it, true)
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
            is CallState.Reconnecting -> state.remoteUserId
            else -> null
        }
        remoteUserId?.let { socketManager.toggleCamera(it, enabled) }
    }

    fun switchCamera() {
        webRTCClient?.switchCamera { isFront ->
            _isFrontCamera.value = isFront
        }
    }

    fun toggleSpeaker() {
        audioManager.toggleSpeaker()
    }

    fun initRemoteRenderer(renderer: SurfaceViewRenderer) {
        webRTCClient?.initRemoteRenderer(renderer)
        _remoteVideoTrack.value?.addSink(renderer)
    }

    fun initScreenShareRenderer(renderer: SurfaceViewRenderer) {
        webRTCClient?.initRemoteRenderer(renderer)
        _remoteScreenTrack.value?.addSink(renderer)
    }

    fun initLocalRenderer(renderer: SurfaceViewRenderer) {
        webRTCClient?.initLocalRenderer(renderer)
        val track = _localVideoTrack.value
        if (track != null) {
            track.addSink(renderer)
        } else {
            Log.w(TAG, "initLocalRenderer called but localVideoTrack is null")
        }
    }

    private fun cleanup() {
        if (isCleaningUp) {
            return
        }
        isCleaningUp = true

        // Cancel all timeouts
        cancelOutgoingCallTimeout()
        cancelIncomingCallTimeout()
        cancelReconnectTimeout()

        // Stop audio
        audioManager.stopRinging()
        audioManager.disableProximitySensor()
        audioManager.abandonAudioFocus()

        // Stop service
        CallService.stop(context)

        // Clear state first to update UI and trigger Compose cleanup
        _callState.value = CallState.Idle

        // Clear tracks
        _remoteVideoTrack.value = null
        _remoteAudioTrack.value = null
        _localVideoTrack.value = null
        _remoteScreenTrack.value = null
        _isRemoteCameraEnabled.value = true
        _isRemoteScreenSharing.value = false
        _isFrontCamera.value = true
        remoteScreenTrackId = null

        // Clear pending signaling
        pendingOffer = null
        pendingOfferFrom = null
        isRemoteDescriptionSet = false
        pendingRenegotiation = false
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
        }
    }

    // WebRTCClient.PeerConnectionObserver implementation
    override fun onIceCandidate(candidate: IceCandidate) {
        val remoteUserId = _callState.value.remoteUserIdOrNull ?: return

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

        when (state) {
            PeerConnection.IceConnectionState.CONNECTED,
            PeerConnection.IceConnectionState.COMPLETED -> {
                // Cancel reconnect timeout if we reconnected
                cancelReconnectTimeout()

                // Transition to Connected if we were Connecting or Reconnecting
                val currentState = _callState.value
                when (currentState) {
                    is CallState.Connecting -> {
                        _callState.value = CallState.Connected(
                            remoteUserId = currentState.remoteUserId,
                            remoteUsername = currentState.remoteUsername,
                            withCamera = currentState.withCamera
                        )

                        // Perform pending renegotiation if needed (e.g., camera added after answer was sent)
                        if (pendingRenegotiation) {
                            pendingRenegotiation = false
                            performRenegotiation(currentState.remoteUserId)
                        }
                    }
                    is CallState.Reconnecting -> {
                        _callState.value = CallState.Connected(
                            remoteUserId = currentState.remoteUserId,
                            remoteUsername = currentState.remoteUsername,
                            withCamera = currentState.withCamera
                        )
                    }
                    else -> {}
                }
            }

            PeerConnection.IceConnectionState.DISCONNECTED -> {
                // Attempt ICE restart
                val currentState = _callState.value
                when (currentState) {
                    is CallState.Connected -> {
                        _callState.value = CallState.Reconnecting(
                            remoteUserId = currentState.remoteUserId,
                            remoteUsername = currentState.remoteUsername,
                            withCamera = currentState.withCamera
                        )
                        webRTCClient?.restartIce()
                        startReconnectTimeout()
                    }
                    is CallState.Connecting -> {
                        // During initial connection, go to Reconnecting
                        _callState.value = CallState.Reconnecting(
                            remoteUserId = currentState.remoteUserId,
                            remoteUsername = currentState.remoteUsername,
                            withCamera = currentState.withCamera
                        )
                        webRTCClient?.restartIce()
                        startReconnectTimeout()
                    }
                    else -> {}
                }
            }

            PeerConnection.IceConnectionState.FAILED -> {
                _callError.tryEmit(CallError(CallErrorType.NETWORK_ERROR, "Connexion perdue"))
                cleanup()
            }

            PeerConnection.IceConnectionState.CLOSED -> {
                cleanup()
            }

            else -> {}
        }
    }

    private fun startReconnectTimeout() {
        reconnectTimeoutJob?.cancel()
        reconnectTimeoutJob = scope.launch {
            delay(RECONNECT_TIMEOUT_MS)
            val currentState = _callState.value
            if (currentState is CallState.Reconnecting) {
                _callError.tryEmit(CallError(CallErrorType.NETWORK_ERROR, "Connexion perdue"))
                cleanup()
            }
        }
    }

    private fun cancelReconnectTimeout() {
        reconnectTimeoutJob?.cancel()
        reconnectTimeoutJob = null
    }

    override fun onAddTrack(track: MediaStreamTrack, streams: Array<out MediaStream>) {

        when (track) {
            is VideoTrack -> {
                // If we already have a camera track, any new video track is the screen share
                if (_remoteVideoTrack.value != null) {
                    _remoteScreenTrack.value = track
                    _isRemoteScreenSharing.value = true
                } else {
                    _remoteVideoTrack.value = track
                }
            }
            is AudioTrack -> {
                _remoteAudioTrack.value = track
                track.setEnabled(true)
            }
        }
    }

    override fun onRemoveTrack(receiver: RtpReceiver) {
        val track = receiver.track()

        when (track) {
            is VideoTrack -> {
                val trackId = track.id()
                when {
                    _remoteVideoTrack.value?.id() == trackId -> {
                        _remoteVideoTrack.value = null
                    }
                    _remoteScreenTrack.value?.id() == trackId -> {
                        _remoteScreenTrack.value = null
                        _isRemoteScreenSharing.value = false
                        remoteScreenTrackId = null
                    }
                    else -> {
                    }
                }
            }
            is AudioTrack -> {
                _remoteAudioTrack.value = null
            }
        }
    }

    override fun onRenegotiationNeeded() {
        val currentState = _callState.value

        // If we're connecting, defer renegotiation until connected
        if (currentState is CallState.Connecting) {
            pendingRenegotiation = true
            return
        }

        // Only renegotiate if we're ALREADY connected
        val remoteUserId = when (currentState) {
            is CallState.Connected -> currentState.remoteUserId
            is CallState.Reconnecting -> currentState.remoteUserId
            else -> null
        }

        if (remoteUserId == null) {
            return
        }

        performRenegotiation(remoteUserId)
    }

    private fun performRenegotiation(remoteUserId: String) {
        scope.launch {
            try {
                val offer = webRTCClient?.createOffer()
                offer?.let {
                    socketManager.sendWebRTCOffer(remoteUserId, it)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to create renegotiation offer", e)
            }
        }
    }

    // CallService.CallActionCallback implementation
    override fun onAcceptCall(callerId: String, withCamera: Boolean) {
        val currentState = _callState.value
        if (currentState is CallState.Incoming && currentState.fromUserId == callerId) {
            // Accept from notification = background, defer camera start until UI is visible
            acceptCall(withCamera, fromBackground = true)
        }
    }

    override fun onRejectCall(callerId: String) {
        val currentState = _callState.value
        if (currentState is CallState.Incoming && currentState.fromUserId == callerId) {
            rejectCall()
        }
    }

    override fun onEndCall() {
        endCall()
    }
}
