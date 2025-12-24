import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { load } from '@tauri-apps/plugin-store';

const SERVER_CONFIGS_KEY = 'server_configs';
const SELECTED_SERVER_KEY = 'selected_server';

export interface ServerConfig {
  id: string;
  name: string;
  url: string;
}

interface ServerConfigContextType {
  servers: ServerConfig[];
  selectedServer: ServerConfig | null;
  isLoading: boolean;
  isConfigured: boolean;
  addServer: (name: string, url: string) => Promise<void>;
  updateServer: (id: string, name: string, url: string) => Promise<void>;
  deleteServer: (id: string) => Promise<void>;
  selectServer: (id: string) => Promise<void>;
  testConnection: (url: string) => Promise<boolean>;
  resetConfig: () => Promise<void>;
}

const ServerConfigContext = createContext<ServerConfigContextType | null>(null);

const DEFAULT_SERVERS: ServerConfig[] = [
  { id: 'local', name: 'Local', url: 'http://localhost:3001' },
  { id: 'production', name: 'Production', url: 'http://51.210.150.25:3001' },
];

export function ServerConfigProvider({ children }: { children: ReactNode }) {
  const [servers, setServers] = useState<ServerConfig[]>([]);
  const [selectedServer, setSelectedServer] = useState<ServerConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initConfig = async () => {
      try {
        const store = await load('settings.json', { autoSave: true, defaults: {} });

        let savedServers = await store.get<ServerConfig[]>(SERVER_CONFIGS_KEY);
        if (!savedServers || savedServers.length === 0) {
          savedServers = DEFAULT_SERVERS;
          await store.set(SERVER_CONFIGS_KEY, savedServers);
        }
        setServers(savedServers);

        const selectedId = await store.get<string>(SELECTED_SERVER_KEY);
        if (selectedId) {
          const server = savedServers.find(s => s.id === selectedId);
          if (server) {
            setSelectedServer(server);
          }
        }
      } catch (error) {
        console.error('Failed to load server config:', error);
        setServers(DEFAULT_SERVERS);
      } finally {
        setIsLoading(false);
      }
    };

    initConfig();
  }, []);

  const addServer = async (name: string, url: string) => {
    const newServer: ServerConfig = {
      id: crypto.randomUUID(),
      name,
      url: url.replace(/\/$/, ''),
    };

    const updatedServers = [...servers, newServer];
    setServers(updatedServers);

    const store = await load('settings.json', { autoSave: true, defaults: {} });
    await store.set(SERVER_CONFIGS_KEY, updatedServers);
  };

  const updateServer = async (id: string, name: string, url: string) => {
    const updatedServers = servers.map(s =>
      s.id === id ? { ...s, name, url: url.replace(/\/$/, '') } : s
    );
    setServers(updatedServers);

    if (selectedServer?.id === id) {
      setSelectedServer({ ...selectedServer, name, url: url.replace(/\/$/, '') });
    }

    const store = await load('settings.json', { autoSave: true, defaults: {} });
    await store.set(SERVER_CONFIGS_KEY, updatedServers);
  };

  const deleteServer = async (id: string) => {
    if (servers.length <= 1) return;

    const updatedServers = servers.filter(s => s.id !== id);
    setServers(updatedServers);

    const store = await load('settings.json', { autoSave: true, defaults: {} });
    await store.set(SERVER_CONFIGS_KEY, updatedServers);

    if (selectedServer?.id === id) {
      setSelectedServer(null);
      await store.delete(SELECTED_SERVER_KEY);
    }
  };

  const selectServer = async (id: string) => {
    const server = servers.find(s => s.id === id);
    if (!server) return;

    setSelectedServer(server);

    const store = await load('settings.json', { autoSave: true, defaults: {} });
    await store.set(SELECTED_SERVER_KEY, id);
  };

  const testConnection = async (url: string): Promise<boolean> => {
    try {
      const response = await fetch(`${url.replace(/\/$/, '')}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      const data = await response.json();
      return data.status === 'ok';
    } catch {
      return false;
    }
  };

  const resetConfig = async () => {
    setSelectedServer(null);
    const store = await load('settings.json', { autoSave: true, defaults: {} });
    await store.delete(SELECTED_SERVER_KEY);
  };

  return (
    <ServerConfigContext.Provider
      value={{
        servers,
        selectedServer,
        isLoading,
        isConfigured: !!selectedServer,
        addServer,
        updateServer,
        deleteServer,
        selectServer,
        testConnection,
        resetConfig,
      }}
    >
      {children}
    </ServerConfigContext.Provider>
  );
}

export function useServerConfig() {
  const context = useContext(ServerConfigContext);
  if (!context) {
    throw new Error('useServerConfig must be used within a ServerConfigProvider');
  }
  return context;
}
