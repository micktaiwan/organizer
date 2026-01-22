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
    console.log('Creating RTCPeerConnection for', targetUser);

    const pc = new RTCPeerConnection(ICE_SERVERS);

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('Sending ICE candidate to', targetUser);
        socketService.sendIceCandidate(targetUser, event.candidate.toJSON());
      }
    };

    // Handle remote tracks
    pc.ontrack = (event) => {
      console.log('Remote track received:', event.track.kind);
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log('Connection state:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        setCallState('connected');
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        console.log('Connection lost, cleaning up');
        endCallInternal();
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', pc.iceConnectionState);
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
    console.log('Ending call internally and cleaning up');
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
    if (!pc || !pc.remoteDescription) return;

    console.log(`Processing ${pendingIceCandidatesRef.current.length} pending ICE candidates`);
    for (const candidate of pendingIceCandidatesRef.current) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('Failed to add pending ICE candidate:', err);
      }
    }
    pendingIceCandidatesRef.current = [];
  }, []);

  // Start a call with specific target user
  const startCall = useCallback(async (targetUser: string, withCamera: boolean) => {
    if (!targetUser) {
      console.error('Cannot start call: no target user');
      return;
    }

    try {
      console.log('Starting call, getting user media...', { withCamera });

      // 1. Create peer connection first
      const pc = createPeerConnection(targetUser);

      // 2. Get user media
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: withCamera,
      });
      localStreamRef.current = stream;
      setIsCameraEnabled(withCamera);

      // 3. Add tracks to peer connection
      stream.getTracks().forEach(track => {
        const sender = pc.addTrack(track, stream);
        sendersRef.current.push(sender);
      });

      // 4. Create and send offer
      console.log('Creating offer...');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketService.sendOffer(targetUser, offer);

      // 5. Send call request via Socket.io
      console.log('Sending call request signaling...');
      socketService.requestCall(targetUser, withCamera);
      setCallState('calling');

      // 6. Play ringback tone while waiting for answer
      playRingback();
    } catch (err) {
      console.error('Failed to start call:', err);
      closePeerConnection();
      alert("Impossible d'accéder au micro ou à la caméra. Vérifiez les permissions système.");
    }
  }, [createPeerConnection, closePeerConnection]);

  // Accept an incoming call
  const acceptCall = useCallback(async (withCamera: boolean) => {
    console.log('User accepted call, setting up local stream...');
    stopRingtone();

    const callTarget = incomingCallFrom?.userId;
    const callerUsername = incomingCallFrom?.username;
    if (!callTarget) {
      console.error('Cannot accept call: no incoming call');
      return;
    }

    try {
      // 1. Create peer connection if not already created (it should be from webrtc:offer)
      let pc = pcRef.current;
      if (!pc) {
        pc = createPeerConnection(callTarget, callerUsername);
      }

      // 2. Get user media
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: withCamera,
      });
      localStreamRef.current = stream;
      setIsCameraEnabled(withCamera);

      // 3. Add tracks to peer connection
      stream.getTracks().forEach(track => {
        const sender = pc!.addTrack(track, stream);
        sendersRef.current.push(sender);
      });

      // 4. Create and send answer (if we have remote description from offer)
      if (pc.remoteDescription) {
        console.log('Creating answer...');
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socketService.sendAnswer(callTarget, answer);
      }

      // 5. Send call accept via Socket.io
      console.log('Sending call-accept signaling...');
      socketService.acceptCall(callTarget, withCamera);
      setCallState('connected');
    } catch (err) {
      console.error('Failed to accept call (getUserMedia error):', err);
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
      console.log('Receiving call request from:', data.from);
      setIncomingCallFrom({ userId: data.from, username: data.fromUsername });
      setRemoteUsername(data.fromUsername);
      setIncomingCallWithCamera(data.withCamera);
      setCallState('incoming');
      playRingtone();
    };

    const handleCallAccept = (data: { from: string; withCamera: boolean }) => {
      console.log('Call accepted by remote');
      stopRingback();
      setRemoteHasCamera(data.withCamera);
      setCallState('connected');
    };

    const handleCallReject = () => {
      console.log('Call rejected by remote');
      addSystemMessage(callState === 'calling' ? 'rejected-call' : 'missed-call');
      endCallInternal();
    };

    const handleCallEnd = () => {
      console.log('Call ended by remote');
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
      console.log('Received WebRTC offer from', data.from);

      // Create peer connection if not exists
      let pc = pcRef.current;
      if (!pc) {
        pc = createPeerConnection(data.from, data.fromUsername);
      }

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        console.log('Remote description set from offer');

        // Process any pending ICE candidates
        await processPendingIceCandidates();

        // If we already have local stream (call already accepted), create answer
        if (localStreamRef.current) {
          console.log('Creating answer...');
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socketService.sendAnswer(data.from, answer);
        }
      } catch (err) {
        console.error('Failed to handle WebRTC offer:', err);
      }
    };

    const handleWebRTCAnswer = async (data: { from: string; answer: RTCSessionDescriptionInit }) => {
      console.log('Received WebRTC answer from', data.from);
      const pc = pcRef.current;
      if (!pc) {
        console.error('No peer connection for answer');
        return;
      }

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        console.log('Remote description set from answer');

        // Process any pending ICE candidates
        await processPendingIceCandidates();
      } catch (err) {
        console.error('Failed to handle WebRTC answer:', err);
      }
    };

    const handleICECandidate = async (data: { from: string; candidate: RTCIceCandidateInit }) => {
      console.log('Received ICE candidate from', data.from);
      const pc = pcRef.current;

      if (!pc) {
        console.log('No peer connection yet, queuing ICE candidate');
        pendingIceCandidatesRef.current.push(data.candidate);
        return;
      }

      if (!pc.remoteDescription) {
        console.log('Remote description not set yet, queuing ICE candidate');
        pendingIceCandidatesRef.current.push(data.candidate);
        return;
      }

      try {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        console.log('ICE candidate added');
      } catch (err) {
        console.error('Failed to add ICE candidate:', err);
      }
    };

    const handleWebRTCClose = (data: { from: string }) => {
      console.log('WebRTC close signal from', data.from);
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
