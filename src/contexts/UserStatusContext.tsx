import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { socketService } from '../services/socket';
import { UserStatus } from '../types';

interface AppVersion {
  versionName: string;
  versionCode: number;
  updatedAt?: string;
}

interface UserStatusData {
  id: string;
  username?: string;
  displayName?: string;
  status: UserStatus;
  statusMessage: string | null;
  statusExpiresAt: string | null;
  isMuted: boolean;
  isOnline: boolean;
  appVersion?: AppVersion | null;
}

interface UserStatusContextType {
  statuses: Map<string, UserStatusData>;
  getStatus: (userId: string) => UserStatusData | undefined;
  isInitialized: boolean;
}

const UserStatusContext = createContext<UserStatusContextType | null>(null);

export const useUserStatus = () => {
  const context = useContext(UserStatusContext);
  if (!context) {
    throw new Error('useUserStatus must be used within a UserStatusProvider');
  }
  return context;
};

interface UserStatusProviderProps {
  children: React.ReactNode;
}

export const UserStatusProvider: React.FC<UserStatusProviderProps> = ({ children }) => {
  const [statuses, setStatuses] = useState<Map<string, UserStatusData>>(new Map());
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize statuses from server
  useEffect(() => {
    const unsubInit = socketService.on('users:init', (data: any) => {
      const users = data.users as UserStatusData[];
      console.log('📥 users:init received:', users.length, 'users');
      const newStatuses = new Map<string, UserStatusData>();
      users.forEach(user => {
        newStatuses.set(user.id.toString(), user);
      });
      setStatuses(newStatuses);
      setIsInitialized(true);
    });

    // Re-initialize when socket reconnects
    const unsubReconnect = socketService.on('internal:connected', () => {
      console.log('🔄 Socket reconnected, waiting for users:init');
      setIsInitialized(false);
    });

    return () => {
      unsubInit();
      unsubReconnect();
    };
  }, []);

  // Listen for status changes
  useEffect(() => {
    const unsubStatusChanged = socketService.on('user:status-changed', (rawData: any) => {
      const data = rawData as {
        userId: string;
        status: UserStatus;
        statusMessage: string | null;
        statusExpiresAt: string | null;
        isMuted: boolean;
      };
      console.log('🔄 user:status-changed received:', data);
      setStatuses(prev => {
        const newStatuses = new Map(prev);
        const existing = newStatuses.get(data.userId);
        newStatuses.set(data.userId, {
          ...existing,
          id: data.userId,
          status: data.status,
          statusMessage: data.statusMessage,
          statusExpiresAt: data.statusExpiresAt,
          isMuted: data.isMuted,
          isOnline: existing?.isOnline ?? true,
        });
        return newStatuses;
      });
    });

    return () => unsubStatusChanged();
  }, []);

  // Listen for online/offline
  useEffect(() => {
    const unsubOnline = socketService.on('user:online', (rawData: any) => {
      const data = rawData as {
        userId: string;
        status?: UserStatus;
        statusMessage?: string | null;
        isMuted?: boolean;
        appVersion?: AppVersion | null;
      };
      console.log('🟢 user:online received:', data.userId, data.appVersion ? `v${data.appVersion.versionName}` : '');
      setStatuses(prev => {
        const newStatuses = new Map(prev);
        const existing = newStatuses.get(data.userId);
        newStatuses.set(data.userId, {
          ...existing,
          id: data.userId,
          status: data.status ?? existing?.status ?? 'available',
          statusMessage: data.statusMessage ?? existing?.statusMessage ?? null,
          statusExpiresAt: existing?.statusExpiresAt ?? null,
          isMuted: data.isMuted ?? existing?.isMuted ?? false,
          isOnline: true,
          appVersion: data.appVersion ?? existing?.appVersion,
        });
        return newStatuses;
      });
    });

    const unsubOffline = socketService.on('user:offline', (rawData: any) => {
      const data = rawData as { userId: string };
      console.log('🔴 user:offline received:', data.userId);
      setStatuses(prev => {
        const newStatuses = new Map(prev);
        const existing = newStatuses.get(data.userId);
        if (existing) {
          newStatuses.set(data.userId, { ...existing, isOnline: false });
        }
        return newStatuses;
      });
    });

    return () => {
      unsubOnline();
      unsubOffline();
    };
  }, []);

  const getStatus = useCallback((userId: string): UserStatusData | undefined => {
    return statuses.get(userId);
  }, [statuses]);

  return (
    <UserStatusContext.Provider value={{ statuses, getStatus, isInitialized }}>
      {children}
    </UserStatusContext.Provider>
  );
};
