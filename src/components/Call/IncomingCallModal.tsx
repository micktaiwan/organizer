import React from "react";

interface IncomingCallModalProps {
  remoteUsername: string;
  incomingCallWithCamera: boolean;
  onAccept: (video: boolean) => void;
  onReject: () => void;
}

export const IncomingCallModal: React.FC<IncomingCallModalProps> = ({
  remoteUsername,
  incomingCallWithCamera,
  onAccept,
  onReject
}) => {
  return (
    <div className="call-overlay incoming-call">
      <div className="incoming-call-modal">
        <div className="caller-info">
          <div className="caller-avatar">📞</div>
          <h3>Appel de {remoteUsername || "inconnu"}</h3>
          <p>{incomingCallWithCamera ? "Appel vidéo" : "Appel audio"}</p>
        </div>
        <div className="incoming-call-actions">
          <button className="reject-btn" onClick={onReject}>
            Refuser
          </button>
          <button className="accept-btn" onClick={() => onAccept(false)}>
            Audio
          </button>
          <button className="accept-btn video" onClick={() => onAccept(true)}>
            Vidéo
          </button>
        </div>
      </div>
    </div>
  );
};

