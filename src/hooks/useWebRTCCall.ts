import { useState, useEffect, useRef, useCallback } from 'react';
import { CallState } from '../types';
import { socketService } from '../services/socket';
import { playRingtone, stopRingtone, playRingback, stopRingback } from '../utils/audio';

// ICE servers configuration (STUN + TURN)
const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls: 'turn:51.210.150.25:3478',
      username: 'organizer',
      credential: 'SecurePassword123!',
    },
  ],
};

interface UseWebRTCCallOptions {
  pcRef: React.MutableRefObject<RTCPeerConnection | null>;
  addSystemMessage: (type: 'missed-call' | 'rejected-call' | 'ended-call') => void;
  selectedMicrophoneId?: string | null;
  selectedCameraId?: string | null;
}

export const useWebRTCCall = ({
  pcRef,
  addSystemMessage,
  selectedMicrophoneId,
  selectedCameraId,
}: UseWebRTCCallOptions) => {
  // Target user for the current call (caller or callee)
  const [targetUserId, setTargetUserId] = useState<string | null>(null);
  const [remoteUsername, setRemoteUsername] = useState<string | null>(null);
  const [callState, setCallState] = useState<CallState>('idle');
  const [isCameraEnabled, setIsCameraEnabled] = useState(false);
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [incomingCallWithCamera, setIncomingCallWithCamera] = useState(false);
  const [remoteHasCamera, setRemoteHasCamera] = useState(false);
  const [incomingCallFrom, setIncomingCallFrom] = useState<{ userId: string; username: string } | null>(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [remoteIsScreenSharing, setRemoteIsScreenSharing] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteScreenVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const sendersRef = useRef<RTCRtpSender[]>([]);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenSenderRef = useRef<RTCRtpSender | null>(null);
  const remoteScreenTrackIdRef = useRef<string | null>(null);

  // Store pending ICE candidates (received before remote description is set)
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  // ICE restart timeout (10s to reconnect before ending call)
  const iceRestartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track if we're the call initiator (only initiator sends ICE restart offers)
  const isInitiatorRef = useRef(false);

  // Ref to hold latest stopScreenShareInternal (avoids stale closure in onended)
  const stopScreenShareInternalRef = useRef<() => void>(() => {});

  // Create RTCPeerConnection
  const createPeerConnection = useCallback((targetUser: string, username?: string) => {
    console.log('[WebRTC][PC] Creating RTCPeerConnection for', targetUser, username ? `(${username})` : '');

    const pc = new RTCPeerConnection(ICE_SERVERS);

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketService.sendIceCandidate(targetUser, event.candidate.toJSON());
      } else {
        console.log('[WebRTC][PC] ICE gathering complete');
      }
    };

    // Handle remote tracks
    pc.ontrack = (event) => {
      console.log('[WebRTC][PC] Remote track received:', event.track.kind, 'id:', event.track.id, 'enabled:', event.track.enabled, 'streams:', event.streams.length);

      // Check if this is the screen share track
      if (event.track.kind === 'video' && remoteScreenTrackIdRef.current && event.track.id === remoteScreenTrackIdRef.current) {
        console.log('[WebRTC][PC] Screen share track identified, attaching to screen video element');
        const screenStream = event.streams[0] || new MediaStream([event.track]);
        if (remoteScreenVideoRef.current) {
          remoteScreenVideoRef.current.srcObject = screenStream;
        }
        // Listen for track ended (remote stopped sharing)
        event.track.onended = () => {
          console.log('[WebRTC][PC] Remote screen track ended');
          setRemoteIsScreenSharing(false);
          remoteScreenTrackIdRef.current = null;
          if (remoteScreenVideoRef.current) {
            remoteScreenVideoRef.current.srcObject = null;
          }
        };
        return;
      }

      // Regular camera/audio track
      if (event.streams[0]) {
        remoteStreamRef.current = event.streams[0];
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
          console.log('[WebRTC][PC] Remote stream attached to video element');
        }
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log('[WebRTC][PC] connectionState:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        // Clear ICE restart timeout if reconnected
        if (iceRestartTimeoutRef.current) {
          console.log('[WebRTC][ICE-RESTART] Reconnected, clearing timeout');
          clearTimeout(iceRestartTimeoutRef.current);
          iceRestartTimeoutRef.current = null;
        }
        setCallState('connected');
      } else if (pc.connectionState === 'failed') {
        console.log('[WebRTC][PC] Connection failed, cleaning up');
        if (iceRestartTimeoutRef.current) {
          clearTimeout(iceRestartTimeoutRef.current);
          iceRestartTimeoutRef.current = null;
        }
        endCallInternal();
      }
      // 'disconnected' is handled by oniceconnectionstatechange (ICE restart)
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[WebRTC][PC] iceConnectionState:', pc.iceConnectionState);

      if (pc.iceConnectionState === 'disconnected') {
        console.log('[WebRTC][ICE-RESTART] ICE disconnected, isInitiator:', isInitiatorRef.current);
        setCallState('reconnecting');

        // Only the initiator sends the restart offer (avoids glare conflicts)
        if (isInitiatorRef.current) {
          pc.restartIce();
          pc.createOffer({ iceRestart: true }).then(async (offer) => {
            await pc.setLocalDescription(offer);
            socketService.sendOffer(targetUser, offer);
            console.log('[WebRTC][ICE-RESTART] Restart offer sent to', targetUser);
          }).catch((err) => {
            console.error('[WebRTC][ICE-RESTART] Failed to create restart offer:', err);
            endCallInternal();
          });
        }

        // Timeout: if not reconnected within 10s, end call
        iceRestartTimeoutRef.current = setTimeout(() => {
          console.log('[WebRTC][ICE-RESTART] Timeout (10s), ending call');
          iceRestartTimeoutRef.current = null;
          endCallInternal();
        }, 10000);
      } else if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        if (iceRestartTimeoutRef.current) {
          console.log('[WebRTC][ICE-RESTART] ICE reconnected, clearing timeout');
          clearTimeout(iceRestartTimeoutRef.current);
          iceRestartTimeoutRef.current = null;
          setCallState('connected');
        }
      } else if (pc.iceConnectionState === 'failed') {
        console.log('[WebRTC][ICE-RESTART] ICE failed, ending call');
        if (iceRestartTimeoutRef.current) {
          clearTimeout(iceRestartTimeoutRef.current);
          iceRestartTimeoutRef.current = null;
        }
        endCallInternal();
      }
    };

    // Handle renegotiation (triggered when tracks are added/removed mid-call)
    pc.onnegotiationneeded = async () => {
      console.log('[WebRTC][PC] negotiationneeded, signalingState:', pc.signalingState, 'connectionState:', pc.connectionState);
      // Only renegotiate if already connected (skip during initial setup)
      if (pc.connectionState !== 'connected') {
        console.log('[WebRTC][PC] Skipping renegotiation - not connected yet');
        return;
      }
      if (pc.signalingState !== 'stable') {
        console.log('[WebRTC][PC] Skipping renegotiation - not in stable state');
        return;
      }

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socketService.sendOffer(targetUser, offer);
        console.log('[WebRTC][PC] Renegotiation offer sent to', targetUser);
      } catch (err) {
        console.error('[WebRTC][PC] Renegotiation failed:', err);
      }
    };

    pc.onicegatheringstatechange = () => {
      console.log('[WebRTC][PC] iceGatheringState:', pc.iceGatheringState);
    };

    pc.onsignalingstatechange = () => {
      console.log('[WebRTC][PC] signalingState:', pc.signalingState);
    };

    pcRef.current = pc;
    setTargetUserId(targetUser);
    if (username) {
      setRemoteUsername(username);
    }

    return pc;
  }, []);

  // Close RTCPeerConnection
  const closePeerConnection = useCallback(() => {
    if (pcRef.current) {
      console.log('Closing RTCPeerConnection');
      pcRef.current.close();
      pcRef.current = null;
    }
    pendingIceCandidatesRef.current = [];
    remoteStreamRef.current = null;
  }, []);

  // Sync local video when camera is enabled
  useEffect(() => {
    if ((callState === 'connected' || callState === 'calling') && localVideoRef.current && localStreamRef.current && isCameraEnabled) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [callState, isCameraEnabled]);

  // Attach remote stream when video element mounts (callState becomes 'connected')
  useEffect(() => {
    if (callState === 'connected' && remoteVideoRef.current && remoteStreamRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
    }
  }, [callState]);

  // Stop local stream and cleanup
  const stopLocalStream = useCallback(() => {
    if (localStreamRef.current) {
      console.log('Stopping local stream tracks');
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
  }, []);

  // Remove tracks from peer connection
  const removeTracksFromPC = useCallback(() => {
    const pc = pcRef.current;
    if (!pc) return;

    sendersRef.current.forEach(sender => {
      try {
        pc.removeTrack(sender);
      } catch (err) {
        console.error('Failed to remove track:', err);
      }
    });
    sendersRef.current = [];
  }, []);

  // End call internally
  const endCallInternal = useCallback(() => {
    console.log('[WebRTC] endCallInternal - cleaning up. PC state:', pcRef.current?.connectionState, 'ICE:', pcRef.current?.iceConnectionState);
    if (iceRestartTimeoutRef.current) {
      clearTimeout(iceRestartTimeoutRef.current);
      iceRestartTimeoutRef.current = null;
    }
    // Clean up screen share
    if (screenTrackRef.current) {
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
    }
    screenSenderRef.current = null;
    remoteScreenTrackIdRef.current = null;
    setIsScreenSharing(false);
    setRemoteIsScreenSharing(false);
    if (remoteScreenVideoRef.current) {
      remoteScreenVideoRef.current.srcObject = null;
    }

    stopRingtone();
    stopRingback();
    stopLocalStream();
    removeTracksFromPC();
    closePeerConnection();
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    setCallState('idle');
    setIsCameraEnabled(false);
    setIsMicEnabled(true);
    setRemoteHasCamera(false);
    setIncomingCallFrom(null);
    setTargetUserId(null);
    setRemoteUsername(null);
    isInitiatorRef.current = false;
  }, [stopLocalStream, removeTracksFromPC, closePeerConnection]);

  // Process pending ICE candidates
  const processPendingIceCandidates = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || !pc.remoteDescription) {
      console.log('[WebRTC][ICE] Cannot process pending: PC?', !!pc, 'remoteDesc?', !!pc?.remoteDescription);
      return;
    }

    const count = pendingIceCandidatesRef.current.length;
    if (count === 0) return;
    console.log(`[WebRTC][ICE] Processing ${count} pending ICE candidates`);
    for (const candidate of pendingIceCandidatesRef.current) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('[WebRTC][ICE] Failed to add pending candidate:', err);
      }
    }
    console.log(`[WebRTC][ICE] All ${count} pending candidates processed`);
    pendingIceCandidatesRef.current = [];
  }, []);

  // Start a call with specific target user
  const startCall = useCallback(async (targetUser: string, withCamera: boolean) => {
    if (!targetUser) {
      console.error('[WebRTC] Cannot start call: no target user');
      return;
    }

    try {
      console.log('[WebRTC][CALLER] Step 1: Creating peer connection for', targetUser);
      isInitiatorRef.current = true;
      const pc = createPeerConnection(targetUser);

      console.log('[WebRTC][CALLER] Step 2: Getting user media...', { withCamera, selectedMicrophoneId, selectedCameraId });
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedMicrophoneId
          ? { deviceId: { exact: selectedMicrophoneId } }
          : true,
        video: withCamera
          ? (selectedCameraId ? { deviceId: { exact: selectedCameraId } } : true)
          : false,
      });
      localStreamRef.current = stream;
      setIsCameraEnabled(withCamera);
      console.log('[WebRTC][CALLER] Step 2: Got media tracks:', stream.getTracks().map(t => `${t.kind}:${t.enabled}`));

      // 3. Add tracks to peer connection
      stream.getTracks().forEach(track => {
        const sender = pc.addTrack(track, stream);
        sendersRef.current.push(sender);
      });
      console.log('[WebRTC][CALLER] Step 3: Added', stream.getTracks().length, 'tracks to PC');

      // 4. Create and send offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      console.log('[WebRTC][CALLER] Step 4: Offer created & local desc set, sending to', targetUser);
      socketService.sendOffer(targetUser, offer);

      // 5. Send call request via Socket.io
      socketService.requestCall(targetUser, withCamera);
      console.log('[WebRTC][CALLER] Step 5: call:request sent');
      setCallState('calling');

      // 6. Play ringback tone while waiting for answer
      playRingback();
    } catch (err) {
      console.error('[WebRTC][CALLER] Failed to start call:', err);
      closePeerConnection();
      alert("Impossible d'accéder au micro ou à la caméra. Vérifiez les permissions système.");
    }
  }, [createPeerConnection, closePeerConnection]);

  // Accept an incoming call
  const acceptCall = useCallback(async (withCamera: boolean) => {
    console.log('[WebRTC][RECEIVER] Accepting call...');
    stopRingtone();

    const callTarget = incomingCallFrom?.userId;
    const callerUsername = incomingCallFrom?.username;
    if (!callTarget) {
      console.error('[WebRTC][RECEIVER] Cannot accept call: incomingCallFrom is null');
      return;
    }

    try {
      // 1. Create peer connection if not already created (it should be from webrtc:offer)
      let pc = pcRef.current;
      console.log('[WebRTC][RECEIVER] Step 1: PC exists?', !!pc, 'remoteDescription?', !!pc?.remoteDescription);
      if (!pc) {
        console.log('[WebRTC][RECEIVER] Step 1: Creating new PC (offer not received yet?)');
        pc = createPeerConnection(callTarget, callerUsername);
      }

      // 2. Get user media
      console.log('[WebRTC][RECEIVER] Step 2: Getting user media...', { withCamera, selectedMicrophoneId, selectedCameraId });
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedMicrophoneId
          ? { deviceId: { exact: selectedMicrophoneId } }
          : true,
        video: withCamera
          ? (selectedCameraId ? { deviceId: { exact: selectedCameraId } } : true)
          : false,
      });
      localStreamRef.current = stream;
      setIsCameraEnabled(withCamera);
      console.log('[WebRTC][RECEIVER] Step 2: Got media tracks:', stream.getTracks().map(t => `${t.kind}:${t.enabled}`));

      // 3. Add tracks to peer connection
      stream.getTracks().forEach(track => {
        const sender = pc!.addTrack(track, stream);
        sendersRef.current.push(sender);
      });
      console.log('[WebRTC][RECEIVER] Step 3: Added', stream.getTracks().length, 'tracks to PC');

      // 4. Create and send answer (if we have remote description from offer)
      if (pc.remoteDescription) {
        console.log('[WebRTC][RECEIVER] Step 4: Creating answer (remoteDescription exists)');
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socketService.sendAnswer(callTarget, answer);
        console.log('[WebRTC][RECEIVER] Step 4: Answer sent to', callTarget);
      } else {
        console.log('[WebRTC][RECEIVER] Step 4: Answer will be created when offer arrives.');
      }

      // 5. Send call accept via Socket.io
      socketService.acceptCall(callTarget, withCamera);
      console.log('[WebRTC][RECEIVER] Step 5: call:accept sent');
      setRemoteHasCamera(incomingCallWithCamera);
      setCallState('connected');
    } catch (err) {
      console.error('[WebRTC][RECEIVER] Failed to accept call:', err);
      closePeerConnection();
      alert('Erreur micro/caméra: ' + (err as Error).message);
    }
  }, [incomingCallFrom, createPeerConnection, closePeerConnection]);

  // Reject an incoming call
  const rejectCall = useCallback(() => {
    console.log('Rejecting call...');
    stopRingtone();

    if (incomingCallFrom?.userId) {
      socketService.rejectCall(incomingCallFrom.userId);
    }

    closePeerConnection();
    addSystemMessage('rejected-call');
    setCallState('idle');
    setIncomingCallFrom(null);
    setRemoteUsername(null);
  }, [incomingCallFrom, addSystemMessage, closePeerConnection]);

  // End the current call
  const endCall = useCallback(() => {
    console.log('Ending call...');
    if (targetUserId) {
      socketService.endCall(targetUserId);
      socketService.closeWebRTC(targetUserId);
    }
    addSystemMessage('ended-call');
    endCallInternal();
  }, [targetUserId, addSystemMessage, endCallInternal]);

  // Toggle microphone
  const toggleMic = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicEnabled(audioTrack.enabled);
      }
    }
  }, []);

  // Toggle camera
  const toggleCamera = useCallback(async () => {
    if (!localStreamRef.current || !targetUserId) return;

    const pc = pcRef.current;
    const videoTracks = localStreamRef.current.getVideoTracks();

    if (isCameraEnabled && videoTracks.length > 0) {
      console.log('Disabling camera');

      // Find the video sender and replace its track with null
      const videoSender = pc?.getSenders().find(s => s.track?.kind === 'video');
      if (videoSender) {
        await videoSender.replaceTrack(null);
      }

      // Stop and remove tracks from local stream
      videoTracks.forEach(track => track.stop());
      videoTracks.forEach(track => localStreamRef.current?.removeTrack(track));

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
      setIsCameraEnabled(false);
      socketService.toggleCamera(targetUserId, false);
    } else {
      try {
        console.log('Enabling camera...', { selectedCameraId });
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: selectedCameraId ? { deviceId: { exact: selectedCameraId } } : true,
        });
        const videoTrack = videoStream.getVideoTracks()[0];
        localStreamRef.current.addTrack(videoTrack);

        // Find existing video sender and replace its track, or add new one
        const videoSender = pc?.getSenders().find(s => s.track === null || s.track?.kind === 'video');
        if (videoSender) {
          console.log('Replacing track on existing sender');
          await videoSender.replaceTrack(videoTrack);
        } else if (pc) {
          console.log('Adding new video track to peer connection');
          const sender = pc.addTrack(videoTrack, localStreamRef.current);
          sendersRef.current.push(sender);
        }

        setIsCameraEnabled(true);
        socketService.toggleCamera(targetUserId, true);
      } catch (err) {
        console.error('Failed to enable camera:', err);
      }
    }
  }, [isCameraEnabled, targetUserId]);

  // Stop screen sharing (defined first to avoid stale closure in startScreenShare)
  const stopScreenShareInternal = useCallback(() => {
    const pc = pcRef.current;

    if (screenSenderRef.current && pc) {
      try {
        pc.removeTrack(screenSenderRef.current);
      } catch (err) {
        console.error('[WebRTC][SCREEN] Failed to remove screen track:', err);
      }
    }
    if (screenTrackRef.current) {
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
    }
    screenSenderRef.current = null;
    setIsScreenSharing(false);

    if (targetUserId) {
      socketService.sendScreenShare(targetUserId, false);
    }
    console.log('[WebRTC][SCREEN] Screen sharing stopped');
  }, [targetUserId]);

  // Keep ref updated for use in onended callback
  useEffect(() => {
    stopScreenShareInternalRef.current = stopScreenShareInternal;
  }, [stopScreenShareInternal]);

  // Start screen sharing
  const startScreenShare = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || !targetUserId) return;

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];
      screenTrackRef.current = screenTrack;

      // Add screen track to peer connection with its own stream
      const sender = pc.addTrack(screenTrack, screenStream);
      screenSenderRef.current = sender;

      setIsScreenSharing(true);
      socketService.sendScreenShare(targetUserId, true, screenTrack.id);
      console.log('[WebRTC][SCREEN] Screen sharing started, trackId:', screenTrack.id);

      // Handle native "Stop sharing" button (use ref to avoid stale closure)
      screenTrack.onended = () => {
        console.log('[WebRTC][SCREEN] Native stop sharing triggered');
        stopScreenShareInternalRef.current();
      };
    } catch (err) {
      console.log('[WebRTC][SCREEN] User cancelled screen share or error:', err);
    }
  }, [targetUserId]);

  // Public stop screen share
  const stopScreenShare = useCallback(() => {
    stopScreenShareInternal();
  }, [stopScreenShareInternal]);

  // Handle Socket.io call events
  useEffect(() => {
    const handleCallRequest = (data: { from: string; fromUsername: string; withCamera: boolean }) => {
      console.log('[WebRTC][SIGNAL] call:request received from', data.fromUsername, `(${data.from})`, { withCamera: data.withCamera });
      console.log('[WebRTC][SIGNAL] PC already exists?', !!pcRef.current, 'remoteDesc?', !!pcRef.current?.remoteDescription);
      setIncomingCallFrom({ userId: data.from, username: data.fromUsername });
      setRemoteUsername(data.fromUsername);
      setIncomingCallWithCamera(data.withCamera);
      setCallState('incoming');
      playRingtone();
    };

    const handleCallAccept = (data: { from: string; withCamera: boolean }) => {
      console.log('[WebRTC][SIGNAL] call:accept received from', data.from, { withCamera: data.withCamera });
      console.log('[WebRTC][SIGNAL] PC state:', pcRef.current?.connectionState, 'ICE:', pcRef.current?.iceConnectionState);
      stopRingback();
      setRemoteHasCamera(data.withCamera);
      setCallState('connected');
    };

    const handleCallReject = () => {
      console.log('[WebRTC][SIGNAL] call:reject received');
      addSystemMessage(callState === 'calling' ? 'rejected-call' : 'missed-call');
      endCallInternal();
    };

    const handleCallEnd = () => {
      console.log('[WebRTC][SIGNAL] call:end received');
      if (callState === 'incoming') {
        addSystemMessage('missed-call');
      } else {
        addSystemMessage('ended-call');
      }
      endCallInternal();
    };

    const handleToggleCamera = (data: { from: string; enabled: boolean }) => {
      setRemoteHasCamera(data.enabled);
    };

    const handleScreenShare = (data: { from: string; enabled: boolean; trackId?: string }) => {
      console.log('[WebRTC][SCREEN] Remote screen share:', data.enabled, 'trackId:', data.trackId);
      if (data.enabled && data.trackId) {
        remoteScreenTrackIdRef.current = data.trackId;
        setRemoteIsScreenSharing(true);
      } else {
        remoteScreenTrackIdRef.current = null;
        setRemoteIsScreenSharing(false);
        if (remoteScreenVideoRef.current) {
          remoteScreenVideoRef.current.srcObject = null;
        }
      }
    };

    const handleCallError = (data: { error: string; message: string }) => {
      console.error('Call error:', data.error, data.message);
      alert(`Erreur d'appel: ${data.message}`);
      endCallInternal();
    };

    const handleWebRTCError = (data: { error: string; message: string }) => {
      console.error('WebRTC error:', data.error, data.message);
      // Only alert if we're actively in a call
      if (callState === 'calling' || callState === 'connected') {
        alert(`Erreur WebRTC: ${data.message}`);
        endCallInternal();
      }
    };

    const handleAnsweredElsewhere = () => {
      // Only dismiss if we're in incoming state (ringing)
      if (callState !== 'incoming') return;

      console.log('Call answered on another device');
      stopRingtone();
      setCallState('idle');
      setIncomingCallFrom(null);
      setRemoteUsername(null);
    };

    const unsubRequest = socketService.on('call:request', (data) =>
      handleCallRequest(data as { from: string; fromUsername: string; withCamera: boolean })
    );
    const unsubAccept = socketService.on('call:accept', (data) =>
      handleCallAccept(data as { from: string; withCamera: boolean })
    );
    const unsubReject = socketService.on('call:reject', handleCallReject);
    const unsubEnd = socketService.on('call:end', handleCallEnd);
    const unsubToggle = socketService.on('call:toggle-camera', (data) =>
      handleToggleCamera(data as { from: string; enabled: boolean })
    );
    const unsubCallError = socketService.on('call:error', (data) =>
      handleCallError(data as { error: string; message: string })
    );
    const unsubWebRTCError = socketService.on('webrtc:error', (data) =>
      handleWebRTCError(data as { error: string; message: string })
    );
    const unsubAnsweredElsewhere = socketService.on('call:answered-elsewhere', handleAnsweredElsewhere);
    const unsubScreenShare = socketService.on('call:screen-share', (data) =>
      handleScreenShare(data as { from: string; enabled: boolean; trackId?: string })
    );

    return () => {
      unsubRequest();
      unsubAccept();
      unsubReject();
      unsubEnd();
      unsubToggle();
      unsubCallError();
      unsubWebRTCError();
      unsubAnsweredElsewhere();
      unsubScreenShare();
    };
  }, [callState, addSystemMessage, endCallInternal]);

  // Handle WebRTC signaling events
  useEffect(() => {
    const handleWebRTCOffer = async (data: { from: string; fromUsername: string; offer: RTCSessionDescriptionInit }) => {
      console.log('[WebRTC][SIGNAL] webrtc:offer received from', data.from);

      // Create peer connection if not exists
      let pc = pcRef.current;
      if (!pc) {
        console.log('[WebRTC][SIGNAL] No PC exists, creating one for offer');
        pc = createPeerConnection(data.from, data.fromUsername);
      } else {
        console.log('[WebRTC][SIGNAL] PC already exists, reusing. State:', pc.connectionState);
      }

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        console.log('[WebRTC][SIGNAL] Remote description set from offer. Pending ICE:', pendingIceCandidatesRef.current.length);

        // Process any pending ICE candidates
        await processPendingIceCandidates();

        // If we already have local stream (call already accepted), create answer
        if (localStreamRef.current) {
          console.log('[WebRTC][SIGNAL] Local stream exists (call already accepted), creating answer...');
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socketService.sendAnswer(data.from, answer);
          console.log('[WebRTC][SIGNAL] Answer created & sent (late offer scenario)');
        } else {
          console.log('[WebRTC][SIGNAL] No local stream yet, answer will be created in acceptCall()');
        }
      } catch (err) {
        console.error('[WebRTC][SIGNAL] Failed to handle offer:', err);
      }
    };

    const handleWebRTCAnswer = async (data: { from: string; answer: RTCSessionDescriptionInit }) => {
      console.log('[WebRTC][SIGNAL] webrtc:answer received from', data.from);
      const pc = pcRef.current;
      if (!pc) {
        console.error('[WebRTC][SIGNAL] No peer connection for answer!');
        return;
      }
      if (pc.signalingState !== 'have-local-offer') {
        console.log('[WebRTC][SIGNAL] Ignoring answer - signalingState is', pc.signalingState, '(expected have-local-offer)');
        return;
      }

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        console.log('[WebRTC][SIGNAL] Remote description set from answer. Pending ICE:', pendingIceCandidatesRef.current.length);

        // Process any pending ICE candidates
        await processPendingIceCandidates();
      } catch (err) {
        console.error('[WebRTC][SIGNAL] Failed to handle answer:', err);
      }
    };

    const handleICECandidate = async (data: { from: string; candidate: RTCIceCandidateInit }) => {
      const pc = pcRef.current;

      if (!pc) {
        console.log('[WebRTC][ICE] No PC yet, queuing candidate. Queue size:', pendingIceCandidatesRef.current.length + 1);
        pendingIceCandidatesRef.current.push(data.candidate);
        return;
      }

      if (!pc.remoteDescription) {
        console.log('[WebRTC][ICE] No remote desc yet, queuing candidate. Queue size:', pendingIceCandidatesRef.current.length + 1);
        pendingIceCandidatesRef.current.push(data.candidate);
        return;
      }

      try {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (err) {
        console.error('[WebRTC][ICE] Failed to add candidate:', err);
      }
    };

    const handleWebRTCClose = (data: { from: string }) => {
      console.log('[WebRTC][SIGNAL] webrtc:close from', data.from);
      endCallInternal();
    };

    const unsubOffer = socketService.on('webrtc:offer', (data) =>
      handleWebRTCOffer(data as { from: string; fromUsername: string; offer: RTCSessionDescriptionInit })
    );
    const unsubAnswer = socketService.on('webrtc:answer', (data) =>
      handleWebRTCAnswer(data as { from: string; answer: RTCSessionDescriptionInit })
    );
    const unsubICE = socketService.on('webrtc:ice-candidate', (data) =>
      handleICECandidate(data as { from: string; candidate: RTCIceCandidateInit })
    );
    const unsubClose = socketService.on('webrtc:close', (data) =>
      handleWebRTCClose(data as { from: string })
    );

    return () => {
      unsubOffer();
      unsubAnswer();
      unsubICE();
      unsubClose();
    };
  }, [createPeerConnection, processPendingIceCandidates, endCallInternal]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopLocalStream();
      removeTracksFromPC();
      closePeerConnection();
    };
  }, [stopLocalStream, removeTracksFromPC, closePeerConnection]);

  return {
    callState,
    isCameraEnabled,
    isMicEnabled,
    incomingCallWithCamera,
    remoteHasCamera,
    incomingCallFrom,
    remoteUsername,
    localVideoRef,
    remoteVideoRef,
    remoteScreenVideoRef,
    isScreenSharing,
    remoteIsScreenSharing,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMic,
    toggleCamera,
    startScreenShare,
    stopScreenShare,
    targetUserId,
  };
};
