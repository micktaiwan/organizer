import React from "react";
import { Phone, Headphones, Mic, MicOff, Video, VideoOff } from "lucide-react";
import { CallState } from "../../types";

interface CallOverlayProps {
  callState: CallState;
  remoteUsername: string;
  isCameraEnabled: boolean;
  isMicEnabled: boolean;
  remoteHasCamera: boolean;
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  remoteVideoRef: React.RefObject<HTMLVideoElement | null>;
  onToggleMic: () => void;
  onToggleCamera: () => void;
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
  onToggleMic,
  onToggleCamera,
  onEndCall
}) => {
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

  if (callState === 'connected') {
    return (
      <div className="call-overlay connected">
        <div className="video-container">
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
          {isCameraEnabled && (
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
          <button className="end-call-btn" onClick={onEndCall}>
            Raccrocher
          </button>
        </div>
      </div>
    );
  }

  return null;
};

