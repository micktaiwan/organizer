import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Send, Trash2, Database, Server, Laptop, Power, RefreshCw, Brain, Skull, ScrollText, MessageCircle } from 'lucide-react';
import { load, Store } from '@tauri-apps/plugin-store';
import { getApiBaseUrl } from '../../services/api';
import { useLocalServerControl } from '../../hooks/useLocalServerControl';
import { loadEkoMessages, saveEkoMessage, clearEkoMessages, EkoServerId } from '../../hooks/useEkoMessageCache';
import { useEkoAuth } from '../../hooks/useEkoAuth';
import { BrainDashboard } from './BrainDashboard';
import { EkoLoginForm } from './EkoLoginForm';
import { useDiagnostic } from './useDiagnostic';
import './PetDebugScreen.css';

const PET_DEBUG_STORE_KEY = 'pet_debug_use_local';

interface Message {
  id: string;
  role: 'user' | 'pet' | 'system';
  content: string;
  expression?: string;
  timestamp: Date;
}

interface PetResponse {
  response: string;
  expression: string;
}

type MessageGroup =
  | { type: 'single'; message: Message }
  | { type: 'system-group'; messages: Message[]; id: string };

interface PetDebugScreenProps {
  showLogPanel?: boolean;
  onToggleLogPanel?: () => void;
  useLocalServer: boolean;
  onUseLocalServerChange: (value: boolean) => void;
  viewMode: 'chat' | 'brain';
  onViewModeChange: (value: 'chat' | 'brain') => void;
}

export function PetDebugScreen({ showLogPanel, onToggleLogPanel, useLocalServer, onUseLocalServerChange, viewMode, onViewModeChange }: PetDebugScreenProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const debugStoreRef = useRef<Store | null>(null);

  // Server URL and ID (needed early for auth hook)
  const serverUrl = useLocalServer ? 'http://localhost:3001' : getApiBaseUrl();
  const getServerId = useCallback((): EkoServerId => useLocalServer ? 'local' : 'prod', [useLocalServer]);

  // Eko-specific auth (independent from main chat auth)
  const ekoAuth = useEkoAuth(getServerId(), serverUrl);

  // Local server control via shared hook
  const localServer = useLocalServerControl();

  // Load cached messages on mount and when server changes
  useEffect(() => {
    const loadCachedMessages = async () => {
      const serverId = getServerId();
      const cached = await loadEkoMessages(serverId);
      // Convert cached messages to local Message format
      const loadedMessages: Message[] = cached.map(msg => ({
        id: msg.id,
        role: msg.role === 'eko' ? 'pet' : msg.role, // Map 'eko' back to 'pet' for display
        content: msg.content,
        expression: msg.expression,
        timestamp: new Date(msg.timestamp),
      }));
      setMessages(loadedMessages);
    };
    loadCachedMessages();
  }, [getServerId]);

  // Save preference when it changes
  const setUseLocalServerPersisted = async (value: boolean) => {
    // Clear any previous error
    setLocalServerError(null);

    // If switching to local, check if server is running first
    if (value && !useLocalServer) {
      const isRunning = await localServer.checkStatus();
      if (!isRunning) {
        setLocalServerError('Server local non démarré');
      }
    }

    onUseLocalServerChange(value);
    try {
      if (!debugStoreRef.current) {
        debugStoreRef.current = await load('pet-debug.json', { autoSave: false, defaults: {} });
      }
      await debugStoreRef.current.set(PET_DEBUG_STORE_KEY, value);
      await debugStoreRef.current.save();
    } catch (error) {
      console.error('[PetDebug] Failed to save preference:', error);
    }
  };

  // Save viewMode preference when it changes
  const setViewModePersisted = async (value: 'chat' | 'brain') => {
    onViewModeChange(value);
    try {
      if (!debugStoreRef.current) {
        debugStoreRef.current = await load('pet-debug.json', { autoSave: false, defaults: {} });
      }
      await debugStoreRef.current.set('viewMode', value);
      await debugStoreRef.current.save();
    } catch (error) {
      console.error('[PetDebug] Failed to save viewMode:', error);
    }
  };
  const [collectionInfo, setCollectionInfo] = useState<string | null>(null);
  const [prodServerStatus, setProdServerStatus] = useState<'unknown' | 'online' | 'offline'>('unknown');
  const [localServerError, setLocalServerError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Group consecutive system messages into single bubbles
  const groupedMessages = useMemo((): MessageGroup[] => {
    const groups: MessageGroup[] = [];
    let systemBuffer: Message[] = [];

    const flushSystemBuffer = () => {
      if (systemBuffer.length > 0) {
        groups.push({
          type: 'system-group',
          messages: systemBuffer,
          id: systemBuffer[0].id,
        });
        systemBuffer = [];
      }
    };

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemBuffer.push(msg);
      } else {
        flushSystemBuffer();
        groups.push({ type: 'single', message: msg });
      }
    }
    flushSystemBuffer();

    return groups;
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Check server status on mount and mode change
  useEffect(() => {
    if (useLocalServer) {
      localServer.checkStatus();
    } else {
      checkProdServer();
    }
  }, [useLocalServer]);

  // Clear error when server starts running
  useEffect(() => {
    if (localServer.isRunning) {
      setLocalServerError(null);
    }
  }, [localServer.isRunning]);

  const checkProdServer = async () => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      setProdServerStatus(response.ok ? 'online' : 'offline');
    } catch {
      setProdServerStatus('offline');
    }
  };

  const addSystemMessage = (content: string) => {
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role: 'system',
      content,
      timestamp: new Date(),
    }]);
  };

  const toggleLocalServer = async () => {
    // Always check real state first
    const isActuallyRunning = await localServer.checkStatus();
    if (isActuallyRunning) {
      await localServer.stopServer();
    } else {
      await localServer.startServer();
    }
  };

  const checkLocalServerWithMessage = async () => {
    const running = await localServer.checkStatus();
    addSystemMessage(running ? 'Server local: Running ✓' : 'Server local: Not responding');
    return running;
  };

  const getAuthHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    // Skip auth for local server (dev mode only), use Eko-specific token for prod
    if (ekoAuth.token && !useLocalServer) {
      headers['Authorization'] = `Bearer ${ekoAuth.token}`;
    }
    return headers;
  };

  // Diagnostic hook
  const { runDiagnostic } = useDiagnostic({
    useLocalServer,
    serverUrl,
    ekoAuthToken: ekoAuth.token,
    getAuthHeaders,
    addSystemMessage,
  });

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    // Cache user message
    saveEkoMessage({
      id: userMessage.id,
      serverId: getServerId(),
      role: 'user',
      content: userMessage.content,
      timestamp: userMessage.timestamp.getTime(),
    });
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch(`${serverUrl}/agent/ask`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ question: input }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: PetResponse = await response.json();

      const ekoMessage: Message = {
        id: crypto.randomUUID(),
        role: 'pet',
        content: data.response,
        expression: data.expression,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, ekoMessage]);
      // Cache Eko response
      saveEkoMessage({
        id: ekoMessage.id,
        serverId: getServerId(),
        role: 'eko',
        content: ekoMessage.content,
        expression: ekoMessage.expression,
        timestamp: ekoMessage.timestamp.getTime(),
      });
    } catch (error) {
      let errorText: string;
      if (error instanceof TypeError && error.message.includes('Load failed')) {
        errorText = 'Erreur Réseau: Server non accessible';
      } else if (error instanceof Error && error.message.includes('401')) {
        errorText = 'Erreur Auth: Token invalide ou expiré';
      } else if (error instanceof Error && error.message.includes('500')) {
        errorText = 'Erreur Serveur: Problème interne (voir logs server)';
      } else {
        errorText = `Erreur: ${error instanceof Error ? error.message : 'Inconnue'}`;
      }
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: 'pet',
        content: errorText,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearMessages = async () => {
    setMessages([]);
    await clearEkoMessages(getServerId());
  };

  const resetSession = async () => {
    try {
      const response = await fetch(`${serverUrl}/agent/reset`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        setMessages([]);
        await clearEkoMessages(getServerId());
        addSystemMessage('Session reset OK');
      } else {
        addSystemMessage(`Reset failed: HTTP ${response.status}`);
      }
    } catch (error) {
      addSystemMessage(`Reset error: ${error}`);
    }
  };

  const checkQdrant = async () => {
    try {
      const response = await fetch(`${serverUrl}/agent/memory/info`, {
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        const r = data.result || data;
        const info = [
          `Status: ${r.status || 'unknown'}`,
          `Mémoires: ${r.points_count ?? '?'}`,
          `Vecteurs: ${r.config?.params?.vectors?.size ?? '?'}d ${r.config?.params?.vectors?.distance ?? ''}`,
        ].join(' | ');
        setCollectionInfo(info);
      } else if (response.status === 401) {
        setCollectionInfo('Erreur Auth: Token invalide ou expiré');
      } else if (response.status === 500) {
        setCollectionInfo('Erreur Serveur: Qdrant probablement non configuré/démarré');
      } else {
        setCollectionInfo(`Erreur Serveur: HTTP ${response.status}`);
      }
    } catch (error) {
      // Network error - server not reachable
      setCollectionInfo('Erreur Réseau: Server non accessible');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="pet-debug-screen">
      {/* Header */}
      <div className="pet-debug-header">
        <h2>Eko</h2>
        <div className="header-controls">
          <div className="server-toggle">
            <button
              className={`toggle-btn ${!useLocalServer ? 'active' : ''}`}
              onClick={() => setUseLocalServerPersisted(false)}
            >
              <Server size={16} />
              Prod
            </button>
            <button
              className={`toggle-btn ${useLocalServer ? 'active' : ''}`}
              onClick={() => setUseLocalServerPersisted(true)}
            >
              <Laptop size={16} />
              Local
            </button>
          </div>
          <div className="server-toggle">
            <button
              className={`toggle-btn ${viewMode === 'chat' ? 'active' : ''}`}
              onClick={() => setViewModePersisted('chat')}
            >
              <MessageCircle size={16} />
              Chat
            </button>
            <button
              className={`toggle-btn ${viewMode === 'brain' ? 'active' : ''}`}
              onClick={() => setViewModePersisted('brain')}
            >
              <Brain size={16} />
              Brain
            </button>
          </div>
          {onToggleLogPanel && (
            <button
              className={`toggle-btn logs-btn ${showLogPanel ? 'active' : ''}`}
              onClick={onToggleLogPanel}
              title={showLogPanel ? 'Hide logs' : 'Show logs'}
            >
              <ScrollText size={16} />
              Logs
            </button>
          )}
        </div>
      </div>

      {/* Server info */}
      <div className="server-info">
        <span>{serverUrl}</span>
        {useLocalServer ? (
          <div className="local-server-controls">
            <span className={`status-dot ${localServer.isRunning ? 'running' : localServer.isStarting ? 'starting' : 'stopped'}`} />
            <span className={localServerError ? 'error-text' : ''}>
              {localServerError || (localServer.isRunning ? 'Running' : localServer.isStarting ? 'Starting...' : 'Stopped')}
            </span>
            <button onClick={toggleLocalServer} title={localServer.isRunning ? 'Stop' : 'Start'}>
              <Power size={14} />
            </button>
            <button onClick={checkLocalServerWithMessage} title="Check status">
              <RefreshCw size={14} />
            </button>
            <button onClick={localServer.forceKillServer} title="Force kill all server processes">
              <Skull size={14} />
            </button>
          </div>
        ) : (
          <div className="local-server-controls">
            <span className={`status-dot ${prodServerStatus === 'online' ? 'running' : prodServerStatus === 'offline' ? 'stopped' : ''}`} />
            <span>{prodServerStatus === 'online' ? 'Online' : prodServerStatus === 'offline' ? 'Offline' : '...'}</span>
            <button onClick={checkProdServer} title="Check status">
              <RefreshCw size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Login form for prod when not authenticated - shown in any mode */}
      {!useLocalServer && !ekoAuth.isAuthenticated && !ekoAuth.isLoading && (
        <EkoLoginForm
          loginUsername={loginUsername}
          setLoginUsername={setLoginUsername}
          loginPassword={loginPassword}
          setLoginPassword={setLoginPassword}
          ekoAuth={ekoAuth}
        />
      )}

      {viewMode === 'chat' ? (
        <>
          {/* Messages */}
          <div className="pet-debug-messages">
            {groupedMessages.map(group => {
              if (group.type === 'single') {
                const msg = group.message;
                return (
                  <div key={msg.id} className={`debug-message ${msg.role}`}>
                    <div className="message-header">
                      <span className="role">
                        {msg.role === 'user' ? 'You' : msg.role === 'pet' ? 'Eko' : 'System'}
                      </span>
                      {msg.expression && (
                        <span className="expression">{msg.expression}</span>
                      )}
                      <span className="time">
                        {msg.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="message-content">{msg.content}</div>
                  </div>
                );
              } else {
                // System group - single bubble with all messages
                const lastMsg = group.messages[group.messages.length - 1];
                return (
                  <div key={group.id} className="debug-message system">
                    <div className="message-header">
                      <span className="role">System</span>
                      <span className="time">
                        {lastMsg.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="message-content">
                      {group.messages.map((msg, idx) => (
                        <div key={msg.id} className={idx > 0 ? 'grouped-line' : ''}>
                          {msg.content}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }
            })}
            {isLoading && (
              <div className="debug-message pet loading">
                <div className="message-content">...</div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Debug panel */}
          {collectionInfo && (
            <div className="debug-panel">
              <pre>{collectionInfo}</pre>
              <button onClick={() => setCollectionInfo(null)}>Close</button>
            </div>
          )}

          {/* Debug buttons */}
          <div className="debug-buttons">
            <button onClick={clearMessages} title="Clear messages">
              <Trash2 size={16} />
              Clear
            </button>
            <button onClick={resetSession} title="Reset Eko session">
              Reset Session
            </button>
            <button onClick={checkQdrant} title="Check Qdrant collection">
              <Database size={16} />
              Qdrant Info
            </button>
            <button onClick={runDiagnostic} title="Diagnostic complet">
              🔍 Diagnostic
            </button>
          </div>

          {/* Input */}
          <div className="pet-debug-input">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message à Eko..."
              disabled={isLoading}
            />
            <button onClick={sendMessage} disabled={isLoading || !input.trim()}>
              <Send size={20} />
            </button>
          </div>
        </>
      ) : (
        <BrainDashboard serverUrl={serverUrl} getAuthHeaders={getAuthHeaders} />
      )}
    </div>
  );
}
