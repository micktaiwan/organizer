import React from "react";
import { StatusSelector } from "../ui/StatusSelector";
import { UserStatus } from "../../types";

interface ChatHeaderProps {
  connected: boolean;
  remoteUsername: string;
  callState: 'idle' | 'calling' | 'incoming' | 'connected';
  onStartCall: (video: boolean) => void;
  isSaved: boolean;
  onSaveContact: () => void;
  onLogout: () => void;
  onOpenAdmin?: () => void;
  onChangeServer?: () => void;
  isAdmin: boolean;
  username: string;
  serverName?: string;
  userStatus?: UserStatus;
  userStatusMessage?: string | null;
  userIsMuted?: boolean;
  onStatusChange?: (status: UserStatus, statusMessage: string | null, isMuted: boolean) => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  connected,
  remoteUsername,
  callState,
  onStartCall,
  isSaved,
  onSaveContact,
  onLogout,
  onOpenAdmin,
  onChangeServer,
  isAdmin,
  username,
  serverName,
  userStatus = 'available',
  userStatusMessage = null,
  userIsMuted = false,
  onStatusChange,
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
        {isAdmin && onOpenAdmin && (
          <button className="admin-btn" onClick={onOpenAdmin} title="Administration">
            ⚙️
          </button>
        )}
        {onChangeServer && (
          <button className="server-btn" onClick={onChangeServer} title={`Serveur: ${serverName || 'Inconnu'}`}>
            🌐
          </button>
        )}
        <StatusSelector
          currentStatus={userStatus}
          currentStatusMessage={userStatusMessage}
          currentIsMuted={userIsMuted}
          onStatusChange={onStatusChange}
        />
        <button className="settings-btn" onClick={onLogout} title="Se déconnecter">
          {username} ⏻
        </button>
      </div>
    </header>
  );
};

