import { useState, useEffect, useRef } from "react";
import Peer, { DataConnection, MediaConnection } from "peerjs";
import { CallState, PeerMessage } from "../types";
import { playRingtone, stopRingtone } from "../utils/audio";

export const useCall = (
  peerRef: React.MutableRefObject<Peer | null>,
  connRef: React.MutableRefObject<DataConnection | null>,
  remotePeerId: string,
  addSystemMessage: (type: "missed-call" | "rejected-call" | "ended-call") => void
) => {
  const [callState, setCallState] = useState<CallState>('idle');
  const [isCameraEnabled, setIsCameraEnabled] = useState(false);
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [incomingCallWithCamera, setIncomingCallWithCamera] = useState(false);
  const [remoteHasCamera, setRemoteHasCamera] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const mediaConnectionRef = useRef<MediaConnection | null>(null);

  useEffect(() => {
    const handlePeerCallEvent = (e: any) => {
      const parsed = e.detail as PeerMessage;
      
      switch (parsed.type) {
        case "call-request":
          setIncomingCallWithCamera(parsed.withCamera || false);
          setCallState('incoming');
          playRingtone();
          break;
        case "call-accept":
          setRemoteHasCamera(parsed.withCamera || false);
          if (peerRef.current && localStreamRef.current) {
            const call = peerRef.current.call(remotePeerId, localStreamRef.current);
            mediaConnectionRef.current = call;
            setupMediaConnection(call);
          }
          break;
        case "call-reject":
          setCallState('idle');
          stopLocalStream();
          addSystemMessage("missed-call");
          break;
        case "call-end":
          addSystemMessage("ended-call");
          endCallInternal();
          break;
        case "call-toggle-camera":
          setRemoteHasCamera(parsed.enabled || false);
          break;
      }
    };

    window.addEventListener("peer-call-event", handlePeerCallEvent);

    if (peerRef.current) {
      const handleCall = (call: MediaConnection) => {
        mediaConnectionRef.current = call;
        if (localStreamRef.current) {
          call.answer(localStreamRef.current);
          setupMediaConnection(call);
        }
      };

      peerRef.current.on("call", handleCall);

      return () => {
        window.removeEventListener("peer-call-event", handlePeerCallEvent);
        peerRef.current?.off("call", handleCall);
        stopLocalStream();
        mediaConnectionRef.current?.close();
      };
    }

    return () => {
      window.removeEventListener("peer-call-event", handlePeerCallEvent);
      stopLocalStream();
      mediaConnectionRef.current?.close();
    };
  }, [remotePeerId, peerRef.current]);

  const stopLocalStream = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
  };

  const endCallInternal = () => {
    stopRingtone();
    stopLocalStream();
    mediaConnectionRef.current?.close();
    mediaConnectionRef.current = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setCallState('idle');
    setIsCameraEnabled(false);
    setIsMicEnabled(true);
    setRemoteHasCamera(false);
  };

  const setupMediaConnection = (call: MediaConnection) => {
    call.on("stream", (remoteStream) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
      setCallState('connected');
    });
    call.on("close", endCallInternal);
    call.on("error", endCallInternal);
  };

  const startCall = async (withCamera: boolean) => {
    if (!connRef.current?.open || !peerRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: withCamera });
      localStreamRef.current = stream;
      setIsCameraEnabled(withCamera);
      if (localVideoRef.current && withCamera) localVideoRef.current.srcObject = stream;
      connRef.current.send({ type: "call-request", withCamera });
      setCallState('calling');
    } catch (err) {
      console.error("Failed to start call:", err);
    }
  };

  const acceptCall = async (withCamera: boolean) => {
    stopRingtone();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: withCamera });
      localStreamRef.current = stream;
      setIsCameraEnabled(withCamera);
      if (localVideoRef.current && withCamera) localVideoRef.current.srcObject = stream;
      if (connRef.current?.open) connRef.current.send({ type: "call-accept", withCamera });
      setCallState('connected');
    } catch (err) {
      console.error("Failed to accept call:", err);
      rejectCall();
    }
  };

  const rejectCall = () => {
    stopRingtone();
    if (connRef.current?.open) connRef.current.send({ type: "call-reject" });
    addSystemMessage("rejected-call");
    setCallState('idle');
  };

  const endCall = () => {
    if (connRef.current?.open) connRef.current.send({ type: "call-end" });
    addSystemMessage("ended-call");
    endCallInternal();
  };

  const toggleMic = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicEnabled(audioTrack.enabled);
      }
    }
  };

  const toggleCamera = async () => {
    if (!localStreamRef.current) return;
    const videoTracks = localStreamRef.current.getVideoTracks();
    if (isCameraEnabled && videoTracks.length > 0) {
      videoTracks.forEach(track => track.stop());
      videoTracks.forEach(track => localStreamRef.current?.removeTrack(track));
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
      setIsCameraEnabled(false);
      connRef.current?.send({ type: "call-toggle-camera", enabled: false });
    } else {
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const videoTrack = videoStream.getVideoTracks()[0];
        localStreamRef.current.addTrack(videoTrack);
        if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
        setIsCameraEnabled(true);
        connRef.current?.send({ type: "call-toggle-camera", enabled: true });
      } catch (err) {
        console.error("Failed to enable camera:", err);
      }
    }
  };

  return {
    callState,
    isCameraEnabled,
    isMicEnabled,
    incomingCallWithCamera,
    remoteHasCamera,
    localVideoRef,
    remoteVideoRef,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMic,
    toggleCamera
  };
};

