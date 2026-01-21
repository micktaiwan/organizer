import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { load, Store } from '@tauri-apps/plugin-store';
import { api, User, setApiBaseUrl } from '../services/api';
import { socketService } from '../services/socket';
import { useServerConfig } from './ServerConfigContext';

// Check if running in Tauri environment
const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// Browser fallback store using localStorage
class BrowserStore {
  private prefix = 'organizer_auth_';

  async get<T>(key: string): Promise<T | null> {
    const value = localStorage.getItem(this.prefix + key);
    return value ? JSON.parse(value) : null;
  }

  async set(key: string, value: unknown): Promise<void> {
    localStorage.setItem(this.prefix + key, JSON.stringify(value));
  }

  async delete(key: string): Promise<void> {
    localStorage.removeItem(this.prefix + key);
  }

  async save(): Promise<void> {
    // localStorage saves immediately, no-op
  }
}

type StoreInterface = Store | BrowserStore;

// Storage keys per server
const getAuthTokenKey = (serverId: string) => `auth_token_${serverId}`;
const getAuthCredentialsKey = (serverId: string) => `auth_credentials_${serverId}`;
const getSavedAccountsKey = (serverId: string) => `saved_accounts_${serverId}`;

interface StoredCredentials {
  username: string;
  email?: string;
  displayName?: string;
}

export interface SavedAccount {
  id: string;           // UUID généré
  userId: string;       // user._id du serveur
  username: string;
  displayName: string;
  token: string;        // JWT (peut expirer)
  lastUsed: string;     // ISO timestamp
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
  // User Switcher
  savedAccounts: SavedAccount[];
  switchToAccount: (accountId: string) => Promise<{ success: boolean; error?: string }>;
  removeAccountFromSwitcher: (accountId: string) => Promise<void>;
  addAccountToSwitcher: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { selectedServer, isConfigured } = useServerConfig();
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const storeRef = useRef<StoreInterface | null>(null);

  const getStore = async (): Promise<StoreInterface> => {
    if (!storeRef.current) {
      if (isTauri()) {
        storeRef.current = await load('settings.json', { autoSave: true, defaults: {} });
      } else {
        storeRef.current = new BrowserStore();
      }
    }
    return storeRef.current;
  };

  // Generate a simple UUID
  const generateId = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  // Load saved accounts for current server
  const loadSavedAccounts = async () => {
    if (!selectedServer) return;
    try {
      const store = await getStore();
      const key = getSavedAccountsKey(selectedServer.id);
      const accounts = await store.get<SavedAccount[]>(key) || [];

      // Deduplicate by username (keep the one with userId, or most recent)
      const byUsername = new Map<string, SavedAccount>();
      for (const a of accounts) {
        const existing = byUsername.get(a.username);
        if (!existing) {
          byUsername.set(a.username, a);
        } else if (a.userId && !existing.userId) {
          byUsername.set(a.username, a);
        } else if (a.lastUsed > existing.lastUsed) {
          byUsername.set(a.username, a);
        }
      }
      const deduplicated = Array.from(byUsername.values());

      // Save back if we removed duplicates
      if (deduplicated.length < accounts.length) {
        await store.set(key, deduplicated);
      }

      // Sort by lastUsed (most recent first)
      const sorted = deduplicated.sort((a, b) =>
        new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime()
      );
      setSavedAccounts(sorted);
    } catch (error) {
      console.error('[Auth] Failed to load saved accounts:', error);
      setSavedAccounts([]);
    }
  };

  // Save account to switcher (called after successful login)
  const saveAccountToSwitcher = async (userObj: User, authToken: string) => {
    if (!selectedServer) return;
    try {
      const store = await getStore();
      const key = getSavedAccountsKey(selectedServer.id);
      const accounts = await store.get<SavedAccount[]>(key) || [];

      // Check if account already exists (by userId or username as fallback)
      const existingIndex = accounts.findIndex(a =>
        a.userId === userObj.id || (!a.userId && a.username === userObj.username)
      );
      const now = new Date().toISOString();

      if (existingIndex >= 0) {
        // Update existing account (ensure userId is set for migration)
        accounts[existingIndex] = {
          ...accounts[existingIndex],
          userId: userObj.id,
          username: userObj.username,
          displayName: userObj.displayName,
          token: authToken,
          lastUsed: now,
        };
      } else {
        // Add new account
        accounts.push({
          id: generateId(),
          userId: userObj.id,
          username: userObj.username,
          displayName: userObj.displayName,
          token: authToken,
          lastUsed: now,
        });
      }

      await store.set(key, accounts);
      // Reload to update state
      await loadSavedAccounts();
    } catch (error) {
      console.error('[Auth] Failed to save account to switcher:', error);
    }
  };

  useEffect(() => {
    // Wait until a server is selected before trying to authenticate
    if (!isConfigured || !selectedServer) {
      setIsLoading(false);
      return;
    }

    // Set API base URL when server changes
    console.log('[Auth] Setting API URL to:', selectedServer.url);
    setApiBaseUrl(selectedServer.url);

    const initAuth = async () => {
      setIsLoading(true);
      try {
        const store = await getStore();
        // Load token specific to this server
        const tokenKey = getAuthTokenKey(selectedServer.id);
        const savedToken = await store.get<string>(tokenKey);

        // Also load saved accounts
        await loadSavedAccounts();

        if (savedToken) {
          api.setToken(savedToken);
          setToken(savedToken);

          try {
            const { user: fetchedUser } = await api.getMe();
            setUser(fetchedUser);
            socketService.connect(savedToken);
            // Update the account in switcher with fresh data
            await saveAccountToSwitcher(fetchedUser, savedToken);
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

    const store = await getStore();
    const tokenKey = getAuthTokenKey(selectedServer.id);
    await store.set(tokenKey, response.token);

    // Save credentials for later use
    await saveCredentials(selectedServer.id, response.user.username, response.user.email, response.user.displayName);

    // Auto-save to user switcher
    await saveAccountToSwitcher(response.user, response.token);

    api.setToken(response.token);
    setToken(response.token);
    setUser(response.user);
    socketService.connect(response.token);
  };

  const register = async (username: string, displayName: string, email: string, password: string) => {
    if (!selectedServer) throw new Error('No server selected');

    const response = await api.register(username, displayName, email, password);

    const store = await getStore();
    const tokenKey = getAuthTokenKey(selectedServer.id);
    await store.set(tokenKey, response.token);

    // Save credentials for later use
    await saveCredentials(selectedServer.id, response.user.username, response.user.email, response.user.displayName);

    // Auto-save to user switcher
    await saveAccountToSwitcher(response.user, response.token);

    api.setToken(response.token);
    setToken(response.token);
    setUser(response.user);
    socketService.connect(response.token);
  };

  const logout = async () => {
    if (selectedServer) {
      const store = await getStore();
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
      const store = await getStore();
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
      const store = await getStore();
      const credKey = getAuthCredentialsKey(serverId);
      await store.set(credKey, { username, email, displayName });
    } catch (error) {
      console.error('Failed to save credentials:', error);
    }
  };

  // Switch to a saved account
  const switchToAccount = async (accountId: string): Promise<{ success: boolean; error?: string }> => {
    if (!selectedServer) return { success: false, error: 'Aucun serveur sélectionné' };

    const account = savedAccounts.find(a => a.id === accountId);
    if (!account) return { success: false, error: 'Compte non trouvé' };

    // If it's the current user, do nothing
    if (user && account.userId === user.id) {
      return { success: true };
    }

    try {
      // Validate token with GET /auth/me
      api.setToken(account.token);
      const { user: fetchedUser } = await api.getMe();

      // Token valid - proceed with switch
      const store = await getStore();
      const tokenKey = getAuthTokenKey(selectedServer.id);
      await store.set(tokenKey, account.token);

      // Update the account's lastUsed
      await saveAccountToSwitcher(fetchedUser, account.token);

      setToken(account.token);
      setUser(fetchedUser);
      socketService.disconnect();
      socketService.connect(account.token);

      return { success: true };
    } catch (error) {
      console.error('[Auth] Token invalid for account:', account.username, error);
      // Reset to previous token if any
      if (token) {
        api.setToken(token);
      }
      return { success: false, error: 'Session expirée' };
    }
  };

  // Remove account from switcher (doesn't affect server)
  const removeAccountFromSwitcher = async (accountId: string): Promise<void> => {
    if (!selectedServer) return;

    try {
      const store = await getStore();
      const key = getSavedAccountsKey(selectedServer.id);
      const accounts = await store.get<SavedAccount[]>(key) || [];

      const filtered = accounts.filter(a => a.id !== accountId);
      await store.set(key, filtered);
      await loadSavedAccounts();
    } catch (error) {
      console.error('[Auth] Failed to remove account from switcher:', error);
    }
  };

  // Logout to add a new account (redirects to auth screen)
  const addAccountToSwitcher = async (): Promise<void> => {
    await logout();
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
        // User Switcher
        savedAccounts,
        switchToAccount,
        removeAccountFromSwitcher,
        addAccountToSwitcher,
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
