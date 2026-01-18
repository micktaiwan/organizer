import React from 'react';
import { Settings, Globe, Hash } from 'lucide-react';
import { Room } from '../../services/api';
import { UserStatus } from '../../types';
import { RoomMembers } from './RoomMembers';
import { StatusSelector } from '../ui/StatusSelector';

interface RoomHeaderProps {
  room: Room;
  currentUserId?: string;
  username: string;
  serverName?: string;
  userStatus: UserStatus;
  userStatusMessage: string | null;
  userStatusExpiresAt?: string | null;
  userIsMuted: boolean;
  callState: string;
  onStartCall: (targetUserId: string, withCamera: boolean) => void;
  onStatusChange: (status: UserStatus, statusMessage: string | null, isMuted: boolean) => void;
  onOpenSettings: () => void;
  onChangeServer: () => void;
}

export const RoomHeader: React.FC<RoomHeaderProps> = ({
  room,
  currentUserId,
  username,
  serverName,
  userStatus,
  userStatusMessage,
  userStatusExpiresAt,
  userIsMuted,
  callState,
  onStartCall,
  onStatusChange,
  onOpenSettings,
  onChangeServer,
}) => {
  return (
    <header className="room-header">
      {/* Left: Room Identity */}
      <div className="room-header__identity">
        <div className="room-header__icon">
          <Hash size={18} strokeWidth={2.5} />
        </div>
        <div className="room-header__info">
          <h1 className="room-header__name">{room.name}</h1>
          <span className="room-header__meta">
            {room.members.length} membre{room.members.length > 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Center: Room Actions */}
      <div className="room-header__actions">
        <RoomMembers
          room={room}
          currentUserId={currentUserId}
          onStartCall={onStartCall}
          callState={callState}
        />
      </div>

      {/* Right: User Controls */}
      <div className="room-header__controls">
        <div className="room-header__toolbar">
          <button
            className="room-header__btn"
            onClick={onOpenSettings}
            title="Paramètres"
          >
            <Settings size={18} />
          </button>
          <button
            className="room-header__btn"
            onClick={onChangeServer}
            title={serverName ? `Serveur: ${serverName}` : 'Changer de serveur'}
          >
            <Globe size={18} />
          </button>
        </div>

        <div className="room-header__divider" />

        <div className="room-header__user">
          <StatusSelector
            currentStatus={userStatus}
            currentStatusMessage={userStatusMessage}
            currentStatusExpiresAt={userStatusExpiresAt}
            currentIsMuted={userIsMuted}
            onStatusChange={onStatusChange}
          />
          <span className="room-header__username">{username}</span>
        </div>
      </div>
    </header>
  );
};
