import React, { useState } from 'react';
import { Globe, Lock, Plus, Trash2, X, AlertTriangle, LogOut } from 'lucide-react';
import { Room } from '../../services/api';

interface RoomListProps {
  rooms: Room[];
  currentRoomId: string | null;
  currentUserId?: string;
  onSelectRoom: (roomId: string) => void;
  onCreateRoom?: () => void;
  onDeleteRoom?: (roomId: string) => Promise<void>;
  onLeaveRoom?: (roomId: string) => Promise<void>;
  isLoading: boolean;
}

interface DeleteConfirmModalProps {
  roomName: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}

const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  roomName,
  onConfirm,
  onCancel,
  isDeleting,
}) => {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="delete-room-modal" onClick={e => e.stopPropagation()}>
        <div className="delete-room-modal-header">
          <AlertTriangle size={24} className="warning-icon" />
          <h3>Supprimer le salon</h3>
          <button className="modal-close-btn" onClick={onCancel}>
            <X size={18} />
          </button>
        </div>
        <div className="delete-room-modal-content">
          <p>
            Etes-vous sur de vouloir supprimer le salon <strong>"{roomName}"</strong> ?
          </p>
          <p className="delete-warning">
            Cette action est irreversible. Tous les messages et fichiers seront definitivement supprimes.
          </p>
        </div>
        <div className="delete-room-modal-actions">
          <button className="cancel-btn" onClick={onCancel} disabled={isDeleting}>
            Annuler
          </button>
          <button className="delete-btn" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? 'Suppression...' : 'Supprimer'}
          </button>
        </div>
      </div>
    </div>
  );
};

export const RoomList: React.FC<RoomListProps> = ({
  rooms,
  currentRoomId,
  currentUserId,
  onSelectRoom,
  onCreateRoom,
  onDeleteRoom,
  onLeaveRoom,
  isLoading,
}) => {
  const [roomToDelete, setRoomToDelete] = useState<Room | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLeaving, setIsLeaving] = useState<string | null>(null);

  const handleDeleteClick = (e: React.MouseEvent, room: Room) => {
    e.stopPropagation();
    setRoomToDelete(room);
  };

  const handleConfirmDelete = async () => {
    if (!roomToDelete || !onDeleteRoom) return;

    setIsDeleting(true);
    try {
      await onDeleteRoom(roomToDelete._id);
      setRoomToDelete(null);
    } catch (error) {
      console.error('Failed to delete room:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const canDeleteRoom = (room: Room) => {
    if (!currentUserId || !onDeleteRoom) return false;
    if (room.isLobby || room.type === 'lobby') return false;
    // Check if user is the creator
    const creatorId = typeof room.createdBy === 'string'
      ? room.createdBy
      : (room.createdBy as any)?._id || (room.createdBy as any)?.id;
    return creatorId === currentUserId;
  };

  const canLeaveRoom = (room: Room) => {
    if (!currentUserId || !onLeaveRoom) return false;
    if (room.isLobby || room.type === 'lobby') return false;
    // Check if user is a member (not just viewer)
    const isMember = room.members.some(m => {
      const memberId = typeof m.userId === 'string' ? m.userId : (m.userId as any)?._id || (m.userId as any)?.id;
      return memberId === currentUserId;
    });
    // Can leave if member but not creator (creator should delete instead)
    const creatorId = typeof room.createdBy === 'string'
      ? room.createdBy
      : (room.createdBy as any)?._id || (room.createdBy as any)?.id;
    return isMember && creatorId !== currentUserId;
  };

  const handleLeaveClick = async (e: React.MouseEvent, room: Room) => {
    e.stopPropagation();
    if (!onLeaveRoom || isLeaving) return;

    setIsLeaving(room._id);
    try {
      await onLeaveRoom(room._id);
    } catch (error) {
      console.error('Failed to leave room:', error);
    } finally {
      setIsLeaving(null);
    }
  };

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
    <>
      <aside className="room-list">
        <div className="room-list-header">
          <h3>Salons</h3>
          {onCreateRoom && (
            <button
              className="room-list-add-btn"
              onClick={onCreateRoom}
              title="Nouveau salon"
            >
              <Plus size={18} />
            </button>
          )}
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
              {canLeaveRoom(room) && (
                <button
                  className="room-leave-btn"
                  onClick={(e) => handleLeaveClick(e, room)}
                  title="Quitter le salon"
                  disabled={isLeaving === room._id}
                >
                  <LogOut size={14} />
                </button>
              )}
              {canDeleteRoom(room) && (
                <button
                  className="room-delete-btn"
                  onClick={(e) => handleDeleteClick(e, room)}
                  title="Supprimer le salon"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      </aside>

      {roomToDelete && (
        <DeleteConfirmModal
          roomName={roomToDelete.name}
          onConfirm={handleConfirmDelete}
          onCancel={() => setRoomToDelete(null)}
          isDeleting={isDeleting}
        />
      )}
    </>
  );
};
