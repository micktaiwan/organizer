import { useState, useEffect, useRef, useCallback } from 'react';
import { CallState } from '../types';
import { socketService } from '../services/socket';
import { playRingtone, stopRingtone } from '../utils/audio';

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

  // Handle remote stream
  useEffect(() => {
    const pc = pcRef.current;
    if (!pc) return;

    const handleTrack = (event: RTCTrackEvent) => {
      console.log('Remote track received:', event.track.kind);
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
      if (callState === 'calling') {
        setCallState('connected');
      }
    };

    pc.addEventListener('track', handleTrack);

    return () => {
      pc.removeEventListener('track', handleTrack);
    };
  }, [pcRef.current, callState]);

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
    stopLocalStream();
    removeTracksFromPC();
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    setCallState('idle');
    setIsCameraEnabled(false);
    setIsMicEnabled(true);
    setRemoteHasCamera(false);
    setIncomingCallFrom(null);
    setTargetUserId(null);
  }, [stopLocalStream, removeTracksFromPC]);

  // Add tracks to peer connection and renegotiate
  const addTracksAndRenegotiate = useCallback(async (stream: MediaStream, target: string) => {
    const pc = pcRef.current;
    if (!pc || !target) return;

    // Add tracks to peer connection
    stream.getTracks().forEach(track => {
      const sender = pc.addTrack(track, stream);
      sendersRef.current.push(sender);
    });

    // Renegotiate the connection
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketService.sendOffer(target, offer);
    } catch (err) {
      console.error('Failed to renegotiate:', err);
    }
  }, []);

  // Start a call with specific target user
  const startCall = useCallback(async (targetUser: string, withCamera: boolean) => {
    if (!targetUser) {
      console.error('Cannot start call: no target user');
      return;
    }

    setTargetUserId(targetUser);

    try {
      console.log('Starting call, getting user media...', { withCamera });
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: withCamera,
      });
      localStreamRef.current = stream;
      setIsCameraEnabled(withCamera);

      // Add tracks to peer connection
      await addTracksAndRenegotiate(stream, targetUser);

      // Send call request via Socket.io
      console.log('Sending call request signaling...');
      socketService.requestCall(targetUser, withCamera);
      setCallState('calling');
    } catch (err) {
      console.error('Failed to get local stream for call:', err);
      alert("Impossible d'accéder au micro ou à la caméra. Vérifiez les permissions système.");
    }
  }, [addTracksAndRenegotiate]);

  // Accept an incoming call
  const acceptCall = useCallback(async (withCamera: boolean) => {
    console.log('User accepted call, setting up local stream...');
    stopRingtone();

    const callTarget = incomingCallFrom?.userId;
    if (!callTarget) {
      console.error('Cannot accept call: no incoming call');
      return;
    }

    setTargetUserId(callTarget);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: withCamera,
      });
      localStreamRef.current = stream;
      setIsCameraEnabled(withCamera);

      // Add tracks to peer connection
      await addTracksAndRenegotiate(stream, callTarget);

      // Send call accept via Socket.io
      console.log('Sending call-accept signaling...');
      socketService.acceptCall(callTarget, withCamera);
      setCallState('connected');
    } catch (err) {
      console.error('Failed to accept call (getUserMedia error):', err);
      alert('Erreur micro/caméra: ' + (err as Error).message);
    }
  }, [incomingCallFrom, addTracksAndRenegotiate]);

  // Reject an incoming call
  const rejectCall = useCallback(() => {
    console.log('Rejecting call...');
    stopRingtone();

    if (incomingCallFrom?.userId) {
      socketService.rejectCall(incomingCallFrom.userId);
    }

    addSystemMessage('rejected-call');
    setCallState('idle');
    setIncomingCallFrom(null);
  }, [incomingCallFrom, addSystemMessage]);

  // End the current call
  const endCall = useCallback(() => {
    console.log('Ending call...');
    if (targetUserId) {
      socketService.endCall(targetUserId);
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

    const videoTracks = localStreamRef.current.getVideoTracks();

    if (isCameraEnabled && videoTracks.length > 0) {
      console.log('Disabling camera');
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

        // Add the new video track to the peer connection
        const pc = pcRef.current;
        if (pc) {
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
      setIncomingCallWithCamera(data.withCamera);
      setCallState('incoming');
      playRingtone();
    };

    const handleCallAccept = (data: { from: string; withCamera: boolean }) => {
      console.log('Call accepted by remote');
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

    return () => {
      unsubRequest();
      unsubAccept();
      unsubReject();
      unsubEnd();
      unsubToggle();
    };
  }, [callState, addSystemMessage, endCallInternal]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopLocalStream();
      removeTracksFromPC();
    };
  }, [stopLocalStream, removeTracksFromPC]);

  return {
    callState,
    isCameraEnabled,
    isMicEnabled,
    incomingCallWithCamera,
    remoteHasCamera,
    incomingCallFrom,
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
