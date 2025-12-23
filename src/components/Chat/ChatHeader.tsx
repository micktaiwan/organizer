import React from "react";

interface ChatHeaderProps {
  connected: boolean;
  remoteUsername: string;
  callState: 'idle' | 'calling' | 'incoming' | 'connected';
  onStartCall: (video: boolean) => void;
  isSaved: boolean;
  onSaveContact: () => void;
  onConnect: () => void;
  onChangeUsername: () => void;
  username: string;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  connected,
  remoteUsername,
  callState,
  onStartCall,
  isSaved,
  onSaveContact,
  onConnect,
  onChangeUsername,
  username
}) => {
  return (
    <header className="chat-header">
      <span className={`status-dot ${connected ? "online" : "offline"}`} />
      <h2>{connected ? (remoteUsername || "Connecté") : "Hors ligne"}</h2>
      <div className="header-actions">
        {connected && callState === 'idle' && (
          <>
            <button className="call-btn" onClick={() => onStartCall(false)} title="Appel audio">
              📞
            </button>
            <button className="call-btn" onClick={() => onStartCall(true)} title="Appel vidéo">
              📹
            </button>
            {!isSaved && (
              <button className="save-contact-btn" onClick={onSaveContact} title="Sauvegarder ce contact">
                💾
              </button>
            )}
          </>
        )}
        {!connected && (
          <button className="connect-btn" onClick={onConnect}>
            Connecter
          </button>
        )}
        <button className="settings-btn" onClick={onChangeUsername} title="Changer de pseudo">
          {username}
        </button>
      </div>
    </header>
  );
};

