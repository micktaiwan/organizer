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
}

export const useWebRTCCall = ({
  pcRef,
  addSystemMessage,
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

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const sendersRef = useRef<RTCRtpSender[]>([]);

  // Store pending ICE candidates (received before remote description is set)
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

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
      console.log('[WebRTC][PC] Remote track received:', event.track.kind, 'enabled:', event.track.enabled, 'streams:', event.streams.length);
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
        console.log('[WebRTC][PC] Remote stream attached to video element');
      } else {
        console.warn('[WebRTC][PC] Cannot attach remote stream! videoRef:', !!remoteVideoRef.current, 'streams:', event.streams.length);
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log('[WebRTC][PC] connectionState:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        setCallState('connected');
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        console.log('[WebRTC][PC] Connection lost/failed, cleaning up');
        endCallInternal();
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[WebRTC][PC] iceConnectionState:', pc.iceConnectionState);
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
  }, []);

  // Sync local video when camera is enabled
  useEffect(() => {
    if ((callState === 'connected' || callState === 'calling') && localVideoRef.current && localStreamRef.current && isCameraEnabled) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [callState, isCameraEnabled]);

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
      const pc = createPeerConnection(targetUser);

      console.log('[WebRTC][CALLER] Step 2: Getting user media...', { withCamera });
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: withCamera,
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
      console.log('[WebRTC][RECEIVER] Step 2: Getting user media...', { withCamera });
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: withCamera,
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
        console.warn('[WebRTC][RECEIVER] Step 4: NO remoteDescription! Answer will be created when offer arrives.');
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
        console.log('Enabling camera...');
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
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

    return () => {
      unsubRequest();
      unsubAccept();
      unsubReject();
      unsubEnd();
      unsubToggle();
      unsubCallError();
      unsubWebRTCError();
      unsubAnsweredElsewhere();
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
      console.log('[WebRTC][SIGNAL] PC state before setRemoteDescription:', pc.connectionState, 'signalingState:', pc.signalingState);

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
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMic,
    toggleCamera,
    targetUserId,
  };
};
