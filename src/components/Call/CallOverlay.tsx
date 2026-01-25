import React, { useState, useEffect, useRef } from "react";
import { Phone, Headphones, Mic, MicOff, Video, VideoOff, Monitor, MonitorOff } from "lucide-react";
import { CallState } from "../../types";

interface CallOverlayProps {
  callState: CallState;
  remoteUsername: string;
  isCameraEnabled: boolean;
  isMicEnabled: boolean;
  remoteHasCamera: boolean;
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  remoteVideoRef: React.RefObject<HTMLVideoElement | null>;
  remoteScreenVideoRef: React.RefObject<HTMLVideoElement | null>;
  isScreenSharing: boolean;
  remoteIsScreenSharing: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onStartScreenShare: () => void;
  onStopScreenShare: () => void;
  onEndCall: () => void;
}

export const CallOverlay: React.FC<CallOverlayProps> = ({
  callState,
  remoteUsername,
  isCameraEnabled,
  isMicEnabled,
  remoteHasCamera,
  localVideoRef,
  remoteVideoRef,
  remoteScreenVideoRef,
  isScreenSharing,
  remoteIsScreenSharing,
  onToggleMic,
  onToggleCamera,
  onStartScreenShare,
  onStopScreenShare,
  onEndCall
}) => {
  const [callDuration, setCallDuration] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Draggable PiP state for remote camera when screen sharing is active
  const [pipOffset, setPipOffset] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const pipStartRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (callState === 'connected' || callState === 'reconnecting') {
      if (!intervalRef.current) {
        intervalRef.current = setInterval(() => {
          setCallDuration(d => d + 1);
        }, 1000);
      }
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setCallDuration(0);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [callState]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handlePipMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    pipStartRef.current = { ...pipOffset };

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current) return;
      setPipOffset({
        x: pipStartRef.current.x + (ev.clientX - dragStartRef.current.x),
        y: pipStartRef.current.y + (ev.clientY - dragStartRef.current.y),
      });
    };
    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  if (callState === 'calling') {
    return (
      <div className="call-overlay">
        <div className="calling-info">
          <div className="caller-avatar pulse" style={{ fontSize: '3rem' }}>
            <Phone size={48} />
          </div>
          <h3>Appel en cours...</h3>
          <p>{remoteUsername || "En attente de réponse"}</p>
          <button className="end-call-btn" onClick={onEndCall}>
            Raccrocher
          </button>
        </div>
      </div>
    );
  }

  if (callState === 'connected' || callState === 'reconnecting') {
    return (
      <div className="call-overlay connected">
        <div className="call-status-bar">
          {callState === 'reconnecting' ? (
            <span className="reconnecting-banner">Reconnexion...</span>
          ) : (
            <span className="call-duration">{formatDuration(callDuration)}</span>
          )}
          {isScreenSharing && (
            <span className="screen-share-indicator">Partage d'écran en cours</span>
          )}
        </div>
        <div className="video-container">
          {/* When receiving screen share: screen fullscreen + remote cam as PiP */}
          {remoteIsScreenSharing ? (
            <>
              <video
                ref={remoteScreenVideoRef}
                autoPlay
                playsInline
                className="remote-video screen-share-video"
              />
              {remoteHasCamera && (
                <div
                  className="screen-share-cam-pip"
                  style={{ transform: `translate(${pipOffset.x}px, ${pipOffset.y}px)` }}
                  onMouseDown={handlePipMouseDown}
                >
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="pip-video"
                  />
                </div>
              )}
              {!remoteHasCamera && (
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  style={{ display: 'none' }}
                />
              )}
            </>
          ) : (
            <>
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className={`remote-video ${!remoteHasCamera ? 'audio-only' : ''}`}
              />
              {!remoteHasCamera && (
                <div className="audio-only-avatar">
                  <Headphones size={64} />
                  <p>{remoteUsername || "Connecté"}</p>
                </div>
              )}
            </>
          )}
          {/* Keep screen video element mounted but hidden when not receiving */}
          {!remoteIsScreenSharing && (
            <video
              ref={remoteScreenVideoRef}
              autoPlay
              playsInline
              style={{ display: 'none' }}
            />
          )}
          {isCameraEnabled && !remoteIsScreenSharing && (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="local-video"
            />
          )}
        </div>
        <div className="call-controls">
          <button
            className={`control-btn ${!isMicEnabled ? 'disabled' : ''}`}
            onClick={onToggleMic}
            title={isMicEnabled ? "Couper le micro" : "Activer le micro"}
          >
            {isMicEnabled ? <Mic size={20} /> : <MicOff size={20} />}
          </button>
          <button
            className={`control-btn ${!isCameraEnabled ? 'disabled' : ''}`}
            onClick={onToggleCamera}
            title={isCameraEnabled ? "Couper la caméra" : "Activer la caméra"}
          >
            {isCameraEnabled ? <Video size={20} /> : <VideoOff size={20} />}
          </button>
          <button
            className={`control-btn screen-share-btn ${isScreenSharing ? 'active' : ''}`}
            onClick={isScreenSharing ? onStopScreenShare : onStartScreenShare}
            title={isScreenSharing ? "Arrêter le partage" : "Partager l'écran"}
          >
            {isScreenSharing ? <MonitorOff size={20} /> : <Monitor size={20} />}
          </button>
          <button className="end-call-btn" onClick={onEndCall}>
            Raccrocher
          </button>
        </div>
      </div>
    );
  }

  return null;
};
