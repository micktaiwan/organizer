import React from 'react';
import { Room } from '../../services/api';
import { useUserStatus } from '../../contexts/UserStatusContext';
import './OnlineMembers.css';

interface OnlineMembersProps {
  room: Room;
  currentUserId?: string;
}

export const OnlineMembers: React.FC<OnlineMembersProps> = ({ room, currentUserId }) => {
  const { getStatus } = useUserStatus();

  const onlineHumans = room.members
    .map(member => {
      const userId = typeof member.userId === 'object' ? member.userId.id || (member.userId as any)._id : member.userId;
      const user = typeof member.userId === 'object' ? member.userId : null;
      if (!user || userId === currentUserId || user.isBot) return null;
      const statusData = getStatus(userId);
      if (!statusData?.isOnline) return null;
      return {
        userId,
        displayName: user.displayName || user.username,
        status: statusData.status || 'available',
      };
    })
    .filter(Boolean) as { userId: string; displayName: string; status: string }[];

  if (onlineHumans.length === 0) return null;

  return (
    <div className="online-members">
      {onlineHumans.map(member => (
        <span key={member.userId} className="online-members__chip">
          <span className={`status-dot ${member.status}`} />
          <span className="online-members__name">{member.displayName}</span>
        </span>
      ))}
    </div>
  );
};
