import React from 'react';
import { Globe, Lock } from 'lucide-react';
import { Room } from '../../services/api';

interface RoomListProps {
  rooms: Room[];
  currentRoomId: string | null;
  onSelectRoom: (roomId: string) => void;
  isLoading: boolean;
}

export const RoomList: React.FC<RoomListProps> = ({
  rooms,
  currentRoomId,
  onSelectRoom,
  isLoading,
}) => {
  if (isLoading) {
    return (
      <aside className="room-list">
        <div className="room-list-loading">Chargement des salons...</div>
      </aside>
    );
  }

  if (rooms.length === 0) {
    return (
      <aside className="room-list">
        <div className="room-list-empty">Aucun salon disponible</div>
      </aside>
    );
  }

  return (
    <aside className="room-list">
      <div className="room-list-header">
        <h3>Salons</h3>
      </div>
      <div className="room-list-items">
        {rooms.map(room => (
          <div
            key={room._id}
            className={`room-item ${currentRoomId === room._id ? 'active' : ''}`}
            onClick={() => onSelectRoom(room._id)}
          >
            <div className="room-info">
              <div className="room-name">
                {room.isLobby && <Globe size={14} style={{ marginRight: '0.5rem', display: 'inline' }} />}
                {room.type === 'private' && <Lock size={14} style={{ marginRight: '0.5rem', display: 'inline' }} />}
                {room.name}
              </div>
              <div className="room-members">
                {room.members.length} membre{room.members.length !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
};
