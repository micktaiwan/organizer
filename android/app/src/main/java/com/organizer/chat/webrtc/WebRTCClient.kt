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
    private var localRenderer: SurfaceViewRenderer? = null
    private var isFrontCamera = true

    interface PeerConnectionObserver {
        fun onIceCandidate(candidate: IceCandidate)
        fun onIceConnectionChange(state: PeerConnection.IceConnectionState)
        fun onAddTrack(track: MediaStreamTrack, streams: Array<out MediaStream>)
        fun onRemoveTrack(receiver: RtpReceiver)
        fun onRenegotiationNeeded()
    }

    fun initPeerConnectionFactory() {

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

    }

    fun createPeerConnection() {

        val rtcConfig = PeerConnection.RTCConfiguration(ICE_SERVERS).apply {
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
            continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY
        }

        peerConnection = peerConnectionFactory?.createPeerConnection(
            rtcConfig,
            object : PeerConnection.Observer {
                override fun onSignalingChange(state: PeerConnection.SignalingState?) {
                }

                override fun onIceConnectionChange(state: PeerConnection.IceConnectionState?) {
                    state?.let { observer.onIceConnectionChange(it) }
                }

                override fun onIceConnectionReceivingChange(receiving: Boolean) {
                }

                override fun onIceGatheringChange(state: PeerConnection.IceGatheringState?) {
                }

                override fun onIceCandidate(candidate: IceCandidate?) {
                    candidate?.let { observer.onIceCandidate(it) }
                }

                override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>?) {
                }

                override fun onAddStream(stream: MediaStream?) {
                }

                override fun onRemoveStream(stream: MediaStream?) {
                }

                override fun onDataChannel(channel: DataChannel?) {
                }

                override fun onRenegotiationNeeded() {
                    observer.onRenegotiationNeeded()
                }

                override fun onAddTrack(receiver: RtpReceiver?, streams: Array<out MediaStream>?) {
                    receiver?.track()?.let { track ->
                        observer.onAddTrack(track, streams ?: emptyArray())
                    }
                }

                override fun onRemoveTrack(receiver: RtpReceiver?) {
                    receiver?.let { observer.onRemoveTrack(it) }
                }
            }
        )

    }

    fun startLocalAudio() {

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
        } ?: Log.e(TAG, "Failed to create local audio track!")
    }

    fun startLocalVideo(localRenderer: SurfaceViewRenderer?) {

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
        }
    }

    fun initRemoteRenderer(renderer: SurfaceViewRenderer) {
        renderer.init(eglBase?.eglBaseContext, null)
        renderer.setMirror(false)
    }

    fun initLocalRenderer(renderer: SurfaceViewRenderer) {
        renderer.init(eglBase?.eglBaseContext, null)
        renderer.setMirror(isFrontCamera)
        localRenderer = renderer
    }

    suspend fun createOffer(): String = suspendCancellableCoroutine { continuation ->
        val constraints = MediaConstraints().apply {
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveAudio", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveVideo", "true"))
        }

        peerConnection?.createOffer(object : SdpObserver {
            override fun onCreateSuccess(sdp: SessionDescription?) {
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
    }

    fun restartIce() {
        peerConnection?.restartIce()
    }

    fun setLocalAudioEnabled(enabled: Boolean) {
        val track = localAudioTrack
        if (track != null) {
            track.setEnabled(enabled)
        } else {
            Log.e(TAG, "setLocalAudioEnabled($enabled) called but localAudioTrack is NULL!")
        }
    }

    fun setLocalVideoEnabled(enabled: Boolean) {
        // Only use track.setEnabled() - don't stop/start the capturer
        // stopCapture()/startCapture() causes issues:
        // - startCapture() after stopCapture() may fail silently
        // - The capturer state becomes inconsistent
        //
        // track.setEnabled(false) stops sending frames to the peer connection
        // while keeping the capturer running (minimal CPU impact)
        localVideoTrack?.setEnabled(enabled)
    }

    fun switchCamera(onDone: ((Boolean) -> Unit)? = null) {
        val capturer = videoCapturer
        if (capturer == null) {
            Log.e(TAG, "switchCamera: no video capturer")
            return
        }
        capturer.switchCamera(object : CameraVideoCapturer.CameraSwitchHandler {
            override fun onCameraSwitchDone(isFront: Boolean) {
                isFrontCamera = isFront
                localRenderer?.setMirror(isFront)
                onDone?.invoke(isFront)
            }
            override fun onCameraSwitchError(error: String?) {
                Log.e(TAG, "Camera switch failed: $error")
            }
        })
    }

    fun getLocalVideoTrack(): VideoTrack? = localVideoTrack

    fun close() {

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
        localRenderer = null
        isFrontCamera = true

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

    }
}
