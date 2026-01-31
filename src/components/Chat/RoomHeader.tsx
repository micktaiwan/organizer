import React from 'react';
import { Hash, Search } from 'lucide-react';
import { Room } from '../../services/api';
import { UserStatus } from '../../types';
import { RoomMembers } from './RoomMembers';
import { OnlineMembers } from './OnlineMembers';
import { StatusSelector } from '../ui/StatusSelector';
import { UserSwitcher } from '../ui/UserSwitcher';

interface RoomHeaderProps {
  room: Room;
  currentUserId?: string;
  username: string;
  userStatus: UserStatus;
  userStatusMessage: string | null;
  userStatusExpiresAt?: string | null;
  userIsMuted: boolean;
  callState: string;
  onStartCall: (targetUserId: string, withCamera: boolean) => void;
  onStatusChange: (status: UserStatus, statusMessage: string | null, isMuted: boolean) => void;
  onOpenSearch?: () => void;
}

export const RoomHeader: React.FC<RoomHeaderProps> = ({
  room,
  currentUserId,
  username,
  userStatus,
  userStatusMessage,
  userStatusExpiresAt,
  userIsMuted,
  callState,
  onStartCall,
  onStatusChange,
  onOpenSearch,
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
        <OnlineMembers room={room} currentUserId={currentUserId} />
        <RoomMembers
          room={room}
          currentUserId={currentUserId}
          onStartCall={onStartCall}
          callState={callState}
        />
      </div>

      {/* Right: User Controls */}
      <div className="room-header__controls">
        {onOpenSearch && (
          <button
            className="room-header__btn"
            onClick={onOpenSearch}
            title="Rechercher"
          >
            <Search size={18} />
          </button>
        )}
        <StatusSelector
          currentStatus={userStatus}
          currentStatusMessage={userStatusMessage}
          currentStatusExpiresAt={userStatusExpiresAt}
          currentIsMuted={userIsMuted}
          onStatusChange={onStatusChange}
        />
        <UserSwitcher username={username} />
      </div>
    </header>
  );
};
