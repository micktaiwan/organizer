import { useCallback } from 'react';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { apiClient } from '../api/client.js';
import { useStore } from '../stores/store.js';
import { StoredCredentials } from '../types.js';

const CONFIG_PATH = path.join(os.homedir(), '.organizer-cli.json');

export function useAuth() {
  const { user, token, server, setAuth, logout, setServer } = useStore();

  const loadStoredCredentials = useCallback(async (): Promise<boolean> => {
    try {
      if (!fs.existsSync(CONFIG_PATH)) {
        return false;
      }

      const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
      const credentials: StoredCredentials = JSON.parse(data);

      if (!credentials.token || !credentials.user) {
        return false;
      }

      // Set server and token
      if (credentials.server) {
        setServer(credentials.server);
        apiClient.setServer(credentials.server);
      }
      apiClient.setToken(credentials.token);

      // Verify token is still valid
      try {
        const { user } = await apiClient.getMe();
        setAuth(user, credentials.token);
        return true;
      } catch {
        // Token invalid, clear stored credentials
        fs.unlinkSync(CONFIG_PATH);
        return false;
      }
    } catch {
      return false;
    }
  }, [setAuth, setServer]);

  const login = useCallback(async (username: string, password: string): Promise<void> => {
    apiClient.setServer(server);
    const response = await apiClient.login(username, password);

    apiClient.setToken(response.token);
    setAuth(response.user, response.token);

    // Store credentials
    const credentials: StoredCredentials = {
      token: response.token,
      user: response.user,
      server,
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(credentials, null, 2));
  }, [server, setAuth]);

  const handleLogout = useCallback(() => {
    apiClient.setToken(null);
    logout();

    // Remove stored credentials
    if (fs.existsSync(CONFIG_PATH)) {
      fs.unlinkSync(CONFIG_PATH);
    }
  }, [logout]);

  return {
    user,
    token,
    server,
    isAuthenticated: !!user && !!token,
    login,
    logout: handleLogout,
    loadStoredCredentials,
    setServer: (s: string) => {
      setServer(s);
      apiClient.setServer(s);
    },
  };
}
