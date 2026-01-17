import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { load, Store } from '@tauri-apps/plugin-store';

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
  const storeRef = useRef<Store | null>(null);

  const getStore = async (): Promise<Store> => {
    if (!storeRef.current) {
      storeRef.current = await load('settings.json', { autoSave: false, defaults: {} });
    }
    return storeRef.current;
  };

  useEffect(() => {
    const initConfig = async () => {
      try {
        const store = await getStore();

        let savedServers = await store.get<ServerConfig[]>(SERVER_CONFIGS_KEY);
        if (!savedServers || savedServers.length === 0) {
          savedServers = DEFAULT_SERVERS;
          await store.set(SERVER_CONFIGS_KEY, savedServers);
          await store.save();
        }
        setServers(savedServers);

        const selectedId = await store.get<string>(SELECTED_SERVER_KEY);
        const server = savedServers.find(s => s.id === (selectedId || 'local'));
        if (server) {
          setSelectedServer(server);
          if (!selectedId) {
            await store.set(SELECTED_SERVER_KEY, 'local');
            await store.save();
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

    const store = await getStore();
    await store.set(SERVER_CONFIGS_KEY, updatedServers);
    await store.save();
  };

  const updateServer = async (id: string, name: string, url: string) => {
    const updatedServers = servers.map(s =>
      s.id === id ? { ...s, name, url: url.replace(/\/$/, '') } : s
    );
    setServers(updatedServers);

    if (selectedServer?.id === id) {
      setSelectedServer({ ...selectedServer, name, url: url.replace(/\/$/, '') });
    }

    const store = await getStore();
    await store.set(SERVER_CONFIGS_KEY, updatedServers);
    await store.save();
  };

  const deleteServer = async (id: string) => {
    if (servers.length <= 1) return;

    const updatedServers = servers.filter(s => s.id !== id);
    setServers(updatedServers);

    const store = await getStore();
    await store.set(SERVER_CONFIGS_KEY, updatedServers);

    if (selectedServer?.id === id) {
      setSelectedServer(null);
      await store.delete(SELECTED_SERVER_KEY);
    }
    await store.save();
  };

  const selectServer = async (id: string) => {
    const server = servers.find(s => s.id === id);
    if (!server) return;

    setSelectedServer(server);

    try {
      const store = await getStore();
      await store.set(SELECTED_SERVER_KEY, id);
      await store.save();
    } catch (error) {
      console.error('[ServerConfig] Failed to save:', error);
    }
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
    const store = await getStore();
    await store.delete(SELECTED_SERVER_KEY);
    await store.save();
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
