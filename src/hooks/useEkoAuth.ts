import { useState, useEffect, useCallback } from 'react';
import { load, Store } from '@tauri-apps/plugin-store';
import { EkoServerId } from './useEkoMessageCache';

const EKO_STORE_FILE = 'pet-debug.json';

const getEkoTokenKey = (serverId: EkoServerId) => `eko_token_${serverId}`;
const getEkoCredentialsKey = (serverId: EkoServerId) => `eko_credentials_${serverId}`;

interface EkoCredentials {
  username: string;
}

interface UseEkoAuthReturn {
  token: string | null;
  user: EkoCredentials | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

let storePromise: Promise<Store> | null = null;

const getStore = async (): Promise<Store> => {
  if (!storePromise) {
    storePromise = load(EKO_STORE_FILE, { autoSave: false, defaults: {} });
  }
  return storePromise;
};

export const useEkoAuth = (serverId: EkoServerId, serverUrl: string): UseEkoAuthReturn => {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<EkoCredentials | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load token on mount and when serverId changes
  useEffect(() => {
    const loadToken = async () => {
      // Skip auth for local server
      if (serverId === 'local') {
        setToken(null);
        setUser(null);
        setIsLoading(false);
        setError(null);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const store = await getStore();
        const tokenKey = getEkoTokenKey(serverId);
        const credentialsKey = getEkoCredentialsKey(serverId);

        const savedToken = await store.get<string>(tokenKey);
        const savedCredentials = await store.get<EkoCredentials>(credentialsKey);

        if (savedToken) {
          // Validate token with server
          try {
            const response = await fetch(`${serverUrl}/auth/me`, {
              headers: { Authorization: `Bearer ${savedToken}` },
              signal: AbortSignal.timeout(5000),
            });

            if (response.ok) {
              setToken(savedToken);
              setUser(savedCredentials || null);
            } else {
              // Token invalid, clear it
              await store.delete(tokenKey);
              await store.delete(credentialsKey);
              await store.save();
              setToken(null);
              setUser(null);
            }
          } catch {
            // Network error, keep token (might work later)
            setToken(savedToken);
            setUser(savedCredentials || null);
          }
        } else {
          setToken(null);
          setUser(null);
        }
      } catch (err) {
        console.error('[EkoAuth] Failed to load token:', err);
        setError('Failed to load auth state');
      } finally {
        setIsLoading(false);
      }
    };

    loadToken();
  }, [serverId, serverUrl]);

  const login = useCallback(async (username: string, password: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${serverUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || data.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const newToken = data.token;
      const newUser: EkoCredentials = { username: data.user?.username || username };

      // Save to store
      const store = await getStore();
      await store.set(getEkoTokenKey(serverId), newToken);
      await store.set(getEkoCredentialsKey(serverId), newUser);
      await store.save();

      setToken(newToken);
      setUser(newUser);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [serverId, serverUrl]);

  const logout = useCallback(async () => {
    try {
      const store = await getStore();
      await store.delete(getEkoTokenKey(serverId));
      await store.delete(getEkoCredentialsKey(serverId));
      await store.save();
    } catch (err) {
      console.error('[EkoAuth] Failed to clear token:', err);
    }

    setToken(null);
    setUser(null);
    setError(null);
  }, [serverId]);

  return {
    token,
    user,
    isAuthenticated: serverId === 'local' || !!token,
    isLoading,
    error,
    login,
    logout,
  };
};
