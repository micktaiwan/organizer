import React, { useState, useEffect, useRef } from "react";
import { Phone, Headphones, Mic, MicOff, Video, VideoOff, Monitor, MonitorOff, Minimize2, Maximize2 } from "lucide-react";
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
  const [isMinimized, setIsMinimized] = useState(false);
  const [reconnectCountdown, setReconnectCountdown] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectStartRef = useRef<number | null>(null);

  // Draggable PiP state for remote camera when screen sharing is active
  const [pipOffset, setPipOffset] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const pipStartRef = useRef({ x: 0, y: 0 });

  const isActive = callState === 'calling' || callState === 'connected' || callState === 'reconnecting';

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (callState === 'connected' || callState === 'reconnecting') {
      intervalRef.current = setInterval(() => {
        setCallDuration(d => d + 1);
      }, 1000);
    } else if (callState === 'idle') {
      setCallDuration(0);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [callState]);

  useEffect(() => {
    if (callState === 'reconnecting') {
      reconnectStartRef.current = Date.now();
      const RECONNECT_TIMEOUT = 10;
      setReconnectCountdown(RECONNECT_TIMEOUT);
      const timer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - (reconnectStartRef.current ?? Date.now())) / 1000);
        const remaining = RECONNECT_TIMEOUT - elapsed;
        if (remaining <= 0) {
          setReconnectCountdown(null);
          clearInterval(timer);
        } else {
          setReconnectCountdown(remaining);
        }
      }, 1000);
      return () => {
        clearInterval(timer);
        setReconnectCountdown(null);
        reconnectStartRef.current = null;
      };
    }
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

  // Reset minimized state when call ends
  useEffect(() => {
    if (callState === 'idle') {
      setIsMinimized(false);
    }
  }, [callState]);

  if (!isActive) return null;

  return (
    <>
      {/* Minimized bar */}
      {isMinimized && (
        <div className={`call-minimized-bar${callState === 'reconnecting' ? ' reconnecting' : ''}`}>
          <div className="call-minimized-info">
            <Phone size={16} />
            <span className="call-minimized-username">{remoteUsername}</span>
            {callState === 'calling' ? (
              <span className="call-minimized-status">Appel...</span>
            ) : callState === 'reconnecting' ? (
              <span className="call-minimized-status reconnecting">Reconnexion...{reconnectCountdown !== null ? ` (${reconnectCountdown}s)` : ''}</span>
            ) : (
              <span className="call-minimized-duration">{formatDuration(callDuration)}</span>
            )}
          </div>
          <div className="call-minimized-actions">
            <button
              className={`control-btn-mini ${!isMicEnabled ? 'disabled' : ''}`}
              onClick={onToggleMic}
              title={isMicEnabled ? "Couper le micro" : "Activer le micro"}
            >
              {isMicEnabled ? <Mic size={14} /> : <MicOff size={14} />}
            </button>
            <button
              className="control-btn-mini maximize"
              onClick={() => setIsMinimized(false)}
              title="Agrandir l'appel"
            >
              <Maximize2 size={14} />
            </button>
            <button className="control-btn-mini end" onClick={onEndCall}>
              <Phone size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Full overlay - always rendered (hidden when minimized to preserve video srcObject) */}
      {callState === 'calling' && (
        <div className="call-overlay" style={{ display: isMinimized ? 'none' : undefined }}>
          <div className="calling-info">
            <button
              className="call-minimize-btn"
              onClick={() => setIsMinimized(true)}
              title="Minimiser l'appel"
            >
              <Minimize2 size={20} />
            </button>
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
      )}

      {(callState === 'connected' || callState === 'reconnecting') && (
        <div className="call-overlay connected" style={{ display: isMinimized ? 'none' : undefined }}>
          <div className="call-status-bar">
            {callState === 'reconnecting' ? (
              <span className="reconnecting-banner">Reconnexion...{reconnectCountdown !== null ? ` (${reconnectCountdown}s)` : ''}</span>
            ) : (
              <span className="call-duration">{formatDuration(callDuration)}</span>
            )}
            {isScreenSharing && (
              <span className="screen-share-indicator">Partage d'écran en cours</span>
            )}
            <button
              className="call-minimize-btn"
              onClick={() => setIsMinimized(true)}
              title="Minimiser l'appel"
            >
              <Minimize2 size={20} />
            </button>
          </div>
          <div className="video-container">
            {/* When receiving screen share: screen fullscreen + remote cam as PiP */}
            {remoteIsScreenSharing ? (
              <>
                <span className="remote-screen-share-label">Écran de {remoteUsername}</span>
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
            {!remoteIsScreenSharing && (
              isCameraEnabled ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="local-video"
                />
              ) : (
                <div className="local-video local-video-off">
                  <VideoOff size={24} />
                </div>
              )
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
      )}
    </>
  );
};
