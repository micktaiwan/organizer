import React, { useState } from 'react';
import { Globe, Lock, Plus, Trash2, X, AlertTriangle, LogOut, User } from 'lucide-react';
import { Room } from '../../services/api';
import { useUserStatus } from '../../contexts/UserStatusContext';

interface RoomListProps {
  rooms: Room[];
  currentRoomId: string | null;
  currentUserId?: string;
  onSelectRoom: (roomId: string) => void;
  onCreateRoom?: () => void;
  onDeleteRoom?: (roomId: string) => Promise<void>;
  onLeaveRoom?: (roomId: string) => Promise<void>;
  isLoading: boolean;
  username?: string;
  onLogout?: () => void;
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
  username,
  onLogout,
}) => {
  const [roomToDelete, setRoomToDelete] = useState<Room | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLeaving, setIsLeaving] = useState<string | null>(null);
  const { getStatus } = useUserStatus();

  // Get the other user's info for private rooms
  const getPrivateRoomInfo = (room: Room) => {
    if (room.type !== 'private' || !currentUserId) return null;
    const otherMember = room.members.find(m => {
      const memberId = typeof m.userId === 'string' ? m.userId : (m.userId as any)?._id || (m.userId as any)?.id;
      return memberId !== currentUserId;
    });
    if (!otherMember) return null;
    const otherUser = typeof otherMember.userId === 'object' ? otherMember.userId : null;
    const otherUserId = typeof otherMember.userId === 'string'
      ? otherMember.userId
      : (otherMember.userId as any)?._id || (otherMember.userId as any)?.id;
    const statusData = getStatus(otherUserId);
    return {
      displayName: otherUser?.displayName || room.name,
      isOnline: statusData?.isOnline ?? false,
      status: statusData?.status || 'available',
    };
  };

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
          {rooms.map(room => {
            const privateInfo = getPrivateRoomInfo(room);
            const displayName = privateInfo?.displayName || room.name;
            const subtitle = room.type === 'private'
              ? 'Conversation privée'
              : `${room.members.length} membre${room.members.length !== 1 ? 's' : ''}`;

            return (
            <div
              key={room._id}
              className={`room-item ${currentRoomId === room._id ? 'active' : ''}`}
              onClick={() => onSelectRoom(room._id)}
            >
              <div className="room-info">
                <div className="room-name">
                  {room.isLobby && <Globe size={14} />}
                  {room.type === 'public' && <Lock size={14} />}
                  {room.type === 'private' && <User size={14} />}
                  <span>{displayName}</span>
                  {privateInfo?.isOnline && (
                    <span className="status-dot online" title="En ligne" />
                  )}
                </div>
                <div className="room-members">
                  {subtitle}
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
          );
          })}
        </div>
        {onLogout && (
          <div className="room-list-footer">
            <button
              className="room-list-logout-btn"
              onClick={onLogout}
              title="Se déconnecter"
            >
              <LogOut size={14} />
              <span>Déconnexion{username ? ` (${username})` : ''}</span>
            </button>
          </div>
        )}
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
