package com.organizer.chat.webrtc

import android.content.Context
import android.util.Log
import kotlinx.coroutines.suspendCancellableCoroutine
import org.webrtc.*
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class WebRTCClient(
    private val context: Context,
    private val observer: PeerConnectionObserver
) {
    companion object {
        private const val TAG = "WebRTCClient"

        private val ICE_SERVERS = listOf(
            PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer(),
            PeerConnection.IceServer.builder("stun:stun1.l.google.com:19302").createIceServer(),
            PeerConnection.IceServer.builder("turn:51.210.150.25:3478")
                .setUsername("organizer")
                .setPassword("SecurePassword123!")
                .createIceServer()
        )
    }

    private var peerConnectionFactory: PeerConnectionFactory? = null
    private var peerConnection: PeerConnection? = null
    private var localAudioTrack: AudioTrack? = null
    private var localVideoTrack: VideoTrack? = null
    private var videoCapturer: CameraVideoCapturer? = null
    private var surfaceTextureHelper: SurfaceTextureHelper? = null
    private var eglBase: EglBase? = null

    interface PeerConnectionObserver {
        fun onIceCandidate(candidate: IceCandidate)
        fun onIceConnectionChange(state: PeerConnection.IceConnectionState)
        fun onAddTrack(track: MediaStreamTrack, streams: Array<out MediaStream>)
        fun onRemoveTrack(receiver: RtpReceiver)
    }

    fun initPeerConnectionFactory() {
        Log.d(TAG, "Initializing PeerConnectionFactory")

        val options = PeerConnectionFactory.InitializationOptions.builder(context)
            .setEnableInternalTracer(true)
            .createInitializationOptions()
        PeerConnectionFactory.initialize(options)

        eglBase = EglBase.create()

        val encoderFactory = DefaultVideoEncoderFactory(
            eglBase!!.eglBaseContext,
            true,
            true
        )
        val decoderFactory = DefaultVideoDecoderFactory(eglBase!!.eglBaseContext)

        peerConnectionFactory = PeerConnectionFactory.builder()
            .setVideoEncoderFactory(encoderFactory)
            .setVideoDecoderFactory(decoderFactory)
            .setOptions(PeerConnectionFactory.Options())
            .createPeerConnectionFactory()

        Log.d(TAG, "PeerConnectionFactory initialized")
    }

    fun createPeerConnection() {
        Log.d(TAG, "Creating PeerConnection")

        val rtcConfig = PeerConnection.RTCConfiguration(ICE_SERVERS).apply {
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
            continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY
        }

        peerConnection = peerConnectionFactory?.createPeerConnection(
            rtcConfig,
            object : PeerConnection.Observer {
                override fun onSignalingChange(state: PeerConnection.SignalingState?) {
                    Log.d(TAG, "Signaling state: $state")
                }

                override fun onIceConnectionChange(state: PeerConnection.IceConnectionState?) {
                    Log.d(TAG, "ICE connection state: $state")
                    state?.let { observer.onIceConnectionChange(it) }
                }

                override fun onIceConnectionReceivingChange(receiving: Boolean) {
                    Log.d(TAG, "ICE connection receiving: $receiving")
                }

                override fun onIceGatheringChange(state: PeerConnection.IceGatheringState?) {
                    Log.d(TAG, "ICE gathering state: $state")
                }

                override fun onIceCandidate(candidate: IceCandidate?) {
                    Log.d(TAG, "ICE candidate: ${candidate?.sdp}")
                    candidate?.let { observer.onIceCandidate(it) }
                }

                override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>?) {
                    Log.d(TAG, "ICE candidates removed")
                }

                override fun onAddStream(stream: MediaStream?) {
                    Log.d(TAG, "Stream added: ${stream?.id}")
                }

                override fun onRemoveStream(stream: MediaStream?) {
                    Log.d(TAG, "Stream removed: ${stream?.id}")
                }

                override fun onDataChannel(channel: DataChannel?) {
                    Log.d(TAG, "Data channel: ${channel?.label()}")
                }

                override fun onRenegotiationNeeded() {
                    Log.d(TAG, "Renegotiation needed")
                }

                override fun onAddTrack(receiver: RtpReceiver?, streams: Array<out MediaStream>?) {
                    Log.d(TAG, "Track added: ${receiver?.track()?.kind()}")
                    receiver?.track()?.let { track ->
                        observer.onAddTrack(track, streams ?: emptyArray())
                    }
                }

                override fun onRemoveTrack(receiver: RtpReceiver?) {
                    Log.d(TAG, "Track removed")
                    receiver?.let { observer.onRemoveTrack(it) }
                }
            }
        )

        Log.d(TAG, "PeerConnection created")
    }

    fun startLocalAudio() {
        Log.d(TAG, "Starting local audio")

        val audioConstraints = MediaConstraints().apply {
            mandatory.add(MediaConstraints.KeyValuePair("googEchoCancellation", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("googNoiseSuppression", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("googAutoGainControl", "true"))
        }

        val audioSource = peerConnectionFactory?.createAudioSource(audioConstraints)
        localAudioTrack = peerConnectionFactory?.createAudioTrack("audio0", audioSource)

        localAudioTrack?.let { track ->
            track.setEnabled(true)
            peerConnection?.addTrack(track, listOf("stream0"))
            Log.d(TAG, "Local audio track added")
        }
    }

    fun startLocalVideo(localRenderer: SurfaceViewRenderer?) {
        Log.d(TAG, "Starting local video")

        val enumerator = Camera2Enumerator(context)
        val deviceNames = enumerator.deviceNames

        // Prefer front camera
        val frontCamera = deviceNames.find { enumerator.isFrontFacing(it) }
        val cameraName = frontCamera ?: deviceNames.firstOrNull()

        if (cameraName == null) {
            Log.e(TAG, "No camera found")
            return
        }

        videoCapturer = enumerator.createCapturer(cameraName, null)

        surfaceTextureHelper = SurfaceTextureHelper.create("CaptureThread", eglBase?.eglBaseContext)

        val videoSource = peerConnectionFactory?.createVideoSource(videoCapturer!!.isScreencast)
        videoCapturer?.initialize(surfaceTextureHelper, context, videoSource?.capturerObserver)
        videoCapturer?.startCapture(640, 480, 30)

        localVideoTrack = peerConnectionFactory?.createVideoTrack("video0", videoSource)

        localVideoTrack?.let { track ->
            track.setEnabled(true)
            localRenderer?.let { renderer ->
                renderer.init(eglBase?.eglBaseContext, null)
                renderer.setMirror(true)
                track.addSink(renderer)
            }
            peerConnection?.addTrack(track, listOf("stream0"))
            Log.d(TAG, "Local video track added")
        }
    }

    fun initRemoteRenderer(renderer: SurfaceViewRenderer) {
        renderer.init(eglBase?.eglBaseContext, null)
        renderer.setMirror(false)
    }

    fun initLocalRenderer(renderer: SurfaceViewRenderer) {
        renderer.init(eglBase?.eglBaseContext, null)
        renderer.setMirror(true)
    }

    suspend fun createOffer(): String = suspendCancellableCoroutine { continuation ->
        val constraints = MediaConstraints().apply {
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveAudio", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveVideo", "true"))
        }

        peerConnection?.createOffer(object : SdpObserver {
            override fun onCreateSuccess(sdp: SessionDescription?) {
                Log.d(TAG, "Offer created successfully")
                sdp?.let {
                    peerConnection?.setLocalDescription(object : SdpObserver {
                        override fun onSetSuccess() {
                            continuation.resume(it.description)
                        }
                        override fun onSetFailure(error: String?) {
                            continuation.resumeWithException(Exception("Failed to set local description: $error"))
                        }
                        override fun onCreateSuccess(sdp: SessionDescription?) {}
                        override fun onCreateFailure(error: String?) {}
                    }, it)
                }
            }

            override fun onCreateFailure(error: String?) {
                continuation.resumeWithException(Exception("Failed to create offer: $error"))
            }

            override fun onSetSuccess() {}
            override fun onSetFailure(error: String?) {}
        }, constraints)
    }

    suspend fun createAnswer(): String = suspendCancellableCoroutine { continuation ->
        val constraints = MediaConstraints().apply {
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveAudio", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveVideo", "true"))
        }

        peerConnection?.createAnswer(object : SdpObserver {
            override fun onCreateSuccess(sdp: SessionDescription?) {
                Log.d(TAG, "Answer created successfully")
                sdp?.let {
                    peerConnection?.setLocalDescription(object : SdpObserver {
                        override fun onSetSuccess() {
                            continuation.resume(it.description)
                        }
                        override fun onSetFailure(error: String?) {
                            continuation.resumeWithException(Exception("Failed to set local description: $error"))
                        }
                        override fun onCreateSuccess(sdp: SessionDescription?) {}
                        override fun onCreateFailure(error: String?) {}
                    }, it)
                }
            }

            override fun onCreateFailure(error: String?) {
                continuation.resumeWithException(Exception("Failed to create answer: $error"))
            }

            override fun onSetSuccess() {}
            override fun onSetFailure(error: String?) {}
        }, constraints)
    }

    suspend fun setRemoteDescription(sdp: String, type: SessionDescription.Type): Unit = suspendCancellableCoroutine { continuation ->
        val sessionDescription = SessionDescription(type, sdp)

        peerConnection?.setRemoteDescription(object : SdpObserver {
            override fun onSetSuccess() {
                Log.d(TAG, "Remote description set successfully")
                continuation.resume(Unit)
            }

            override fun onSetFailure(error: String?) {
                continuation.resumeWithException(Exception("Failed to set remote description: $error"))
            }

            override fun onCreateSuccess(sdp: SessionDescription?) {}
            override fun onCreateFailure(error: String?) {}
        }, sessionDescription)
    }

    fun addIceCandidate(candidate: String, sdpMid: String, sdpMLineIndex: Int) {
        val iceCandidate = IceCandidate(sdpMid, sdpMLineIndex, candidate)
        peerConnection?.addIceCandidate(iceCandidate)
        Log.d(TAG, "ICE candidate added")
    }

    fun setLocalAudioEnabled(enabled: Boolean) {
        localAudioTrack?.setEnabled(enabled)
        Log.d(TAG, "Local audio enabled: $enabled")
    }

    fun setLocalVideoEnabled(enabled: Boolean) {
        localVideoTrack?.setEnabled(enabled)
        if (enabled) {
            try {
                videoCapturer?.startCapture(640, 480, 30)
            } catch (e: Exception) {
                Log.e(TAG, "Error starting video capture", e)
            }
        } else {
            try {
                videoCapturer?.stopCapture()
            } catch (e: Exception) {
                Log.e(TAG, "Error stopping video capture", e)
            }
        }
        Log.d(TAG, "Local video enabled: $enabled")
    }

    fun getLocalVideoTrack(): VideoTrack? = localVideoTrack

    fun close() {
        Log.d(TAG, "Closing WebRTC client")

        try {
            localAudioTrack?.setEnabled(false)
            localVideoTrack?.setEnabled(false)
        } catch (e: Exception) {
            Log.e(TAG, "Error disabling tracks", e)
        }

        try {
            videoCapturer?.stopCapture()
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping video capture", e)
        }

        try {
            videoCapturer?.dispose()
        } catch (e: Exception) {
            Log.e(TAG, "Error disposing video capturer", e)
        }
        videoCapturer = null

        try {
            localAudioTrack?.dispose()
        } catch (e: Exception) {
            Log.e(TAG, "Error disposing audio track", e)
        }
        localAudioTrack = null

        try {
            localVideoTrack?.dispose()
        } catch (e: Exception) {
            Log.e(TAG, "Error disposing video track", e)
        }
        localVideoTrack = null

        try {
            surfaceTextureHelper?.dispose()
        } catch (e: Exception) {
            Log.e(TAG, "Error disposing surface texture helper", e)
        }
        surfaceTextureHelper = null

        try {
            peerConnection?.close()
            peerConnection?.dispose()
        } catch (e: Exception) {
            Log.e(TAG, "Error disposing peer connection", e)
        }
        peerConnection = null

        try {
            peerConnectionFactory?.dispose()
        } catch (e: Exception) {
            Log.e(TAG, "Error disposing peer connection factory", e)
        }
        peerConnectionFactory = null

        try {
            eglBase?.release()
        } catch (e: Exception) {
            Log.e(TAG, "Error releasing EGL base", e)
        }
        eglBase = null

        Log.d(TAG, "WebRTC client closed")
    }
}
