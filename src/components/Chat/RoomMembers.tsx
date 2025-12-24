import React, { useState } from 'react';
import { Phone, Video, Users } from 'lucide-react';
import { Room } from '../../services/api';

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
    <div className="room-members-widget">
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

              return (
                <div key={user.id} className="room-member-item">
                  <div className="member-info">
                    <div className="member-name">{user.displayName}</div>
                    <div className="member-username">@{user.username}</div>
                  </div>
                  <div className="member-actions">
                    <button
                      className="call-button audio"
                      onClick={() => {
                        onStartCall(user.id, false);
                        setShowMembers(false);
                      }}
                      title="Appel audio"
                    >
                      <Phone size={16} />
                    </button>
                    <button
                      className="call-button video"
                      onClick={() => {
                        onStartCall(user.id, true);
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
