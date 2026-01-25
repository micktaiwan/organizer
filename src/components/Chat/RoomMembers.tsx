import React, { useState, useRef, useEffect } from 'react';
import { Phone, Video, Users, VolumeX, Clock } from 'lucide-react';
import { Room } from '../../services/api';
import { useUserStatus } from '../../contexts/UserStatusContext';
import { UserStatus } from '../../types';

const STATUS_LABELS: Record<UserStatus, string> = {
  available: 'Disponible',
  busy: 'Occupé',
  away: 'Absent',
  dnd: 'Ne pas déranger',
};

function formatExpiresIn(expiresAt: string | null): string | null {
  if (!expiresAt) return null;
  const expires = new Date(expiresAt);
  const now = new Date();
  if (expires <= now) return null;

  const diffMs = expires.getTime() - now.getTime();
  const diffMinutes = Math.round(diffMs / 60000);

  if (diffMinutes < 60) {
    return `${diffMinutes} min`;
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h`;
  }
  return null;
}

interface RoomMembersProps {
  room: Room | null;
  currentUserId: string | undefined;
  onStartCall: (targetUserId: string, withCamera: boolean) => void;
  callState: string;
}

export const RoomMembers: React.FC<RoomMembersProps> = ({
  room,
  currentUserId,
  onStartCall,
  callState,
}) => {
  const [showMembers, setShowMembers] = useState(false);
  const widgetRef = useRef<HTMLDivElement>(null);
  const { getStatus } = useUserStatus();

  useEffect(() => {
    if (!showMembers) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (widgetRef.current && !widgetRef.current.contains(e.target as Node)) {
        setShowMembers(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMembers]);

  if (!room || callState !== 'idle') {
    return null;
  }

  const otherMembers = room.members.filter(member => {
    const userId = typeof member.userId === 'object' ? member.userId.id : member.userId;
    return userId !== currentUserId;
  });

  if (otherMembers.length === 0) {
    return null;
  }

  return (
    <div className="room-members-widget" ref={widgetRef}>
      <button
        className="room-members-toggle"
        onClick={() => setShowMembers(!showMembers)}
        title="Membres du salon"
      >
        <Users size={16} style={{ marginRight: '0.25rem' }} />
        ({otherMembers.length})
      </button>

      {showMembers && (
        <div className="room-members-dropdown">
          <div className="room-members-header">Appeler un membre</div>
          <div className="room-members-list">
            {otherMembers.map(member => {
              const user = typeof member.userId === 'object' ? member.userId : null;
              if (!user) return null;

              // Get status from global cache instead of room data
              // Note: populated user has _id from MongoDB, not id
              const userId = user.id || user._id || '';
              const userStatusData = getStatus(userId);
              const status = userStatusData?.status || 'available';
              const statusMessage = userStatusData?.statusMessage;
              const statusExpiresAt = userStatusData?.statusExpiresAt ?? null;
              const isMuted = userStatusData?.isMuted;
              const expiresIn = formatExpiresIn(statusExpiresAt);

              const isBot = !!user.isBot;
              const isOnline = userStatusData?.isOnline ?? false;

              return (
                <div key={userId} className={`room-member-item${isBot ? ' bot' : ''}`}>
                  <div className="member-info">
                    <div className="member-line1">
                      {!isBot && <span className={`status-dot ${isOnline ? 'online' : 'offline'}`} />}
                      <span className="member-name">{user.displayName}</span>
                      {isMuted && <VolumeX size={14} style={{ opacity: 0.6 }} />}
                      <span className="member-username">@{user.username}</span>
                      {userStatusData?.appVersion && (
                        <span className="member-version">v{userStatusData.appVersion.versionName}</span>
                      )}
                    </div>
                    {!isBot && isOnline && (
                      <div className="member-line2">
                        <span className={`member-status-label ${status}`}>{STATUS_LABELS[status]}</span>
                        {expiresIn && (
                          <span className="member-status-expires">
                            <Clock size={12} />
                            {expiresIn}
                          </span>
                        )}
                        {statusMessage && (
                          <span className="member-status-message">"{statusMessage}"</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="member-actions">
                    <button
                      className="call-button audio"
                      onClick={() => {
                        onStartCall(userId, false);
                        setShowMembers(false);
                      }}
                      title="Appel audio"
                    >
                      <Phone size={16} />
                    </button>
                    <button
                      className="call-button video"
                      onClick={() => {
                        onStartCall(userId, true);
                        setShowMembers(false);
                      }}
                      title="Appel vidéo"
                    >
                      <Video size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
