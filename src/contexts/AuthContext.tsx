import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { load } from '@tauri-apps/plugin-store';
import { api, User, setApiBaseUrl } from '../services/api';
import { socketService } from '../services/socket';
import { useServerConfig } from './ServerConfigContext';

// Storage keys per server
const getAuthTokenKey = (serverId: string) => `auth_token_${serverId}`;
const getAuthCredentialsKey = (serverId: string) => `auth_credentials_${serverId}`;

interface StoredCredentials {
  username: string;
  email?: string;
  displayName?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, displayName: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: User) => void;
  getSavedCredentials: (serverId: string) => Promise<StoredCredentials | null>;
  saveCredentials: (serverId: string, username: string, email?: string, displayName?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { selectedServer, isConfigured } = useServerConfig();
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Wait until a server is selected before trying to authenticate
    if (!isConfigured || !selectedServer) {
      setIsLoading(false);
      return;
    }

    // Set API base URL when server changes
    setApiBaseUrl(selectedServer.url);

    const initAuth = async () => {
      setIsLoading(true);
      try {
        const store = await load('settings.json', { autoSave: true, defaults: {} });
        // Load token specific to this server
        const tokenKey = getAuthTokenKey(selectedServer.id);
        const savedToken = await store.get<string>(tokenKey);

        if (savedToken) {
          api.setToken(savedToken);
          setToken(savedToken);

          try {
            const { user } = await api.getMe();
            setUser(user);
            socketService.connect(savedToken);
          } catch (error) {
            console.error('Token invalid, clearing auth:', error);
            await store.delete(tokenKey);
            api.setToken(null);
            setToken(null);
            setUser(null);
          }
        }
      } catch (error) {
        console.error('Failed to initialize auth:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, [isConfigured, selectedServer]);

  const login = async (username: string, password: string) => {
    if (!selectedServer) throw new Error('No server selected');

    const response = await api.login(username, password);

    const store = await load('settings.json', { autoSave: true, defaults: {} });
    const tokenKey = getAuthTokenKey(selectedServer.id);
    await store.set(tokenKey, response.token);

    // Save credentials for later use
    await saveCredentials(selectedServer.id, response.user.username, response.user.email, response.user.displayName);

    api.setToken(response.token);
    setToken(response.token);
    setUser(response.user);
    socketService.connect(response.token);
  };

  const register = async (username: string, displayName: string, email: string, password: string) => {
    if (!selectedServer) throw new Error('No server selected');

    const response = await api.register(username, displayName, email, password);

    const store = await load('settings.json', { autoSave: true, defaults: {} });
    const tokenKey = getAuthTokenKey(selectedServer.id);
    await store.set(tokenKey, response.token);

    // Save credentials for later use
    await saveCredentials(selectedServer.id, response.user.username, response.user.email, response.user.displayName);

    api.setToken(response.token);
    setToken(response.token);
    setUser(response.user);
    socketService.connect(response.token);
  };

  const logout = async () => {
    if (selectedServer) {
      const store = await load('settings.json', { autoSave: true, defaults: {} });
      const tokenKey = getAuthTokenKey(selectedServer.id);
      await store.delete(tokenKey);
    }

    api.setToken(null);
    setToken(null);
    setUser(null);
    socketService.disconnect();
  };

  const updateUser = (updatedUser: User) => {
    setUser(updatedUser);
  };

  const getSavedCredentials = async (serverId: string): Promise<StoredCredentials | null> => {
    try {
      const store = await load('settings.json', { autoSave: true, defaults: {} });
      const credKey = getAuthCredentialsKey(serverId);
      const saved = await store.get<StoredCredentials>(credKey);
      return saved || null;
    } catch (error) {
      console.error('Failed to load saved credentials:', error);
      return null;
    }
  };

  const saveCredentials = async (serverId: string, username: string, email?: string, displayName?: string) => {
    try {
      const store = await load('settings.json', { autoSave: true, defaults: {} });
      const credKey = getAuthCredentialsKey(serverId);
      await store.set(credKey, { username, email, displayName });
    } catch (error) {
      console.error('Failed to save credentials:', error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        updateUser,
        getSavedCredentials,
        saveCredentials,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export type { StoredCredentials };
