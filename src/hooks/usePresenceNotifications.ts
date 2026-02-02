import { useEffect, useRef } from 'react';
import { socketService } from '../services/socket';
import { useUserStatus } from '../contexts/UserStatusContext';
import { useAuth } from '../contexts/AuthContext';
import { showPresenceNotification } from '../utils/notifications';

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function usePresenceNotifications() {
  const { statuses } = useUserStatus();
  const { user } = useAuth();
  const statusesRef = useRef(statuses);
  statusesRef.current = statuses;

  useEffect(() => {
    if (!isTauri()) return;

    const unsub = socketService.on('user:online', (rawData: any) => {
      const data = rawData as {
        userId: string;
        isBot?: boolean;
      };

      // Skip bots and self
      if (data.isBot) return;
      if (user?.id && data.userId === user.id) return;

      // Only notify on offline → online transition
      const existing = statusesRef.current.get(data.userId);
      if (existing?.isOnline) return;

      const displayName = existing?.displayName || existing?.username || 'Someone';
      showPresenceNotification(displayName);
    });

    return () => unsub();
  }, [user?.id]);
}
