import { useState, useEffect, useRef } from "react";
import Peer, { DataConnection, MediaConnection } from "peerjs";
import { CallState, PeerMessage } from "../types";
import { playRingtone, stopRingtone } from "../utils/audio";

export const useCall = (
  peer: Peer | null,
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
  const incomingMediaCallRef = useRef<MediaConnection | null>(null);

  // Sync streams with video elements when they become available
  useEffect(() => {
    if (callState === 'connected' || callState === 'calling') {
      if (localVideoRef.current && localStreamRef.current && isCameraEnabled) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
    }
  }, [callState, isCameraEnabled]);

  useEffect(() => {
    if (!peer) return;

    const handlePeerCallEvent = (e: any) => {
      const parsed = e.detail as PeerMessage;
      console.log("useCall signaling event received:", parsed.type, parsed);
      
      switch (parsed.type) {
        case "call-request":
          console.log("Receiving call request...");
          setIncomingCallWithCamera(parsed.withCamera || false);
          setCallState('incoming');
          playRingtone();
          break;
        case "call-accept":
          console.log("Call accepted by remote, initiating WebRTC...");
          setRemoteHasCamera(parsed.withCamera || false);
          if (localStreamRef.current) {
            const call = peer.call(remotePeerId, localStreamRef.current);
            console.log("Initiated peer.call to:", remotePeerId);
            mediaConnectionRef.current = call;
            setupMediaConnection(call);
          } else {
            console.error("Cannot start WebRTC: local stream missing");
          }
          break;
        case "call-reject":
          console.log("Call rejected by remote");
          // Si on était en train d'appeler, c'est que l'autre a refusé
          // Si on recevait un appel, c'est que l'autre a annulé (donc manqué pour nous)
          addSystemMessage(callState === 'calling' ? "rejected-call" : "missed-call");
          endCallInternal();
          break;
        case "call-end":
          console.log("Call ended by remote");
          if (callState === 'incoming') {
            addSystemMessage("missed-call");
          } else {
            addSystemMessage("ended-call");
          }
          endCallInternal();
          break;
        case "call-toggle-camera":
          setRemoteHasCamera(parsed.enabled || false);
          break;
      }
    };

    const handleIncomingCall = (call: MediaConnection) => {
      console.log("Incoming WebRTC call from PeerJS:", call.peer);
      // If we already clicked accept, answer immediately
      if (callState === 'connected' || localStreamRef.current) {
        console.log("Answering call immediately with local stream");
        call.answer(localStreamRef.current!);
        mediaConnectionRef.current = call;
        setupMediaConnection(call);
      } else {
        console.log("Call received before user acceptance, saving for later");
        incomingMediaCallRef.current = call;
      }
    };

    window.addEventListener("peer-call-event", handlePeerCallEvent);
    peer.on("call", handleIncomingCall);

    return () => {
      window.removeEventListener("peer-call-event", handlePeerCallEvent);
      peer.off("call", handleIncomingCall);
      stopLocalStream();
      mediaConnectionRef.current?.close();
    };
  }, [peer, remotePeerId, callState]);

  const stopLocalStream = () => {
    if (localStreamRef.current) {
      console.log("Stopping local stream tracks");
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
  };

  const endCallInternal = () => {
    console.log("Ending call internally and cleaning up");
    stopRingtone();
    stopLocalStream();
    mediaConnectionRef.current?.close();
    mediaConnectionRef.current = null;
    incomingMediaCallRef.current = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setCallState('idle');
    setIsCameraEnabled(false);
    setIsMicEnabled(true);
    setRemoteHasCamera(false);
  };

  const setupMediaConnection = (call: MediaConnection) => {
    console.log("Setting up media connection handlers for call:", call.peer);
    call.on("stream", (remoteStream) => {
      console.log("Remote stream received!");
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
      setCallState('connected');
    });
    call.on("close", () => {
      console.log("Media connection closed");
      endCallInternal();
    });
    call.on("error", (err) => {
      console.error("Media connection error:", err);
      endCallInternal();
    });
  };

  const startCall = async (withCamera: boolean) => {
    if (!connRef.current?.open || !peer) {
      console.error("Cannot start call: connection or peer missing");
      return;
    }
    try {
      console.log("Starting call, getting user media...", { withCamera });
      // On utilise les contraintes par défaut pour plus de compatibilité
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: withCamera
      });
      localStreamRef.current = stream;
      setIsCameraEnabled(withCamera);
      
      console.log("Sending call request signaling...");
      connRef.current.send({ type: "call-request", withCamera });
      setCallState('calling');
    } catch (err) {
      console.error("Failed to get local stream for call:", err);
      alert("Impossible d'accéder au micro ou à la caméra. Vérifiez les permissions système.");
    }
  };

  const acceptCall = async (withCamera: boolean) => {
    console.log("User accepted call, setting up local stream...");
    stopRingtone();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: withCamera
      });
      localStreamRef.current = stream;
      setIsCameraEnabled(withCamera);
      
      console.log("Local stream ready, sending call-accept signaling...");
      if (connRef.current?.open) {
        connRef.current.send({ type: "call-accept", withCamera });
      }

      // If we already have an incoming WebRTC call waiting, answer it now
      if (incomingMediaCallRef.current) {
        console.log("Answering pre-received WebRTC call");
        incomingMediaCallRef.current.answer(stream);
        mediaConnectionRef.current = incomingMediaCallRef.current;
        setupMediaConnection(incomingMediaCallRef.current);
        incomingMediaCallRef.current = null;
      }

      setCallState('connected');
    } catch (err) {
      console.error("Failed to accept call (getUserMedia error):", err);
      alert("Erreur micro/caméra: " + (err as Error).message);
      // On ne rejette pas automatiquement ici pour laisser une chance à l'utilisateur
    }
  };

  const rejectCall = () => {
    console.log("Rejecting call...");
    stopRingtone();
    if (connRef.current?.open) {
      connRef.current.send({ type: "call-reject" });
    }
    addSystemMessage("rejected-call");
    setCallState('idle');
    incomingMediaCallRef.current = null;
  };

  const endCall = () => {
    console.log("Ending call...");
    if (connRef.current?.open) {
      connRef.current.send({ type: "call-end" });
    }
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
      console.log("Disabling camera");
      videoTracks.forEach(track => track.stop());
      videoTracks.forEach(track => localStreamRef.current?.removeTrack(track));
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
      setIsCameraEnabled(false);
      connRef.current?.send({ type: "call-toggle-camera", enabled: false });
    } else {
      try {
        console.log("Enabling camera...");
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const videoTrack = videoStream.getVideoTracks()[0];
        localStreamRef.current.addTrack(videoTrack);
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
