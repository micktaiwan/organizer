import { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Trash2, Database, Server, Laptop, Power, RefreshCw, Brain, X, Skull, Copy, ScrollText, Zap } from 'lucide-react';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { Command, Child } from '@tauri-apps/plugin-shell';
import { load, Store } from '@tauri-apps/plugin-store';
import { getApiBaseUrl } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
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

interface MemoryPayload {
  type: string;
  content: string;
  timestamp: string;
  authorName?: string;
  roomName?: string;
}

interface MemoryItem {
  id: string;
  payload: MemoryPayload;
}

interface PetDebugScreenProps {
  showLogPanel?: boolean;
  onToggleLogPanel?: () => void;
  useLocalServer: boolean;
  onUseLocalServerChange: (value: boolean) => void;
}

export function PetDebugScreen({ showLogPanel, onToggleLogPanel, useLocalServer, onUseLocalServerChange }: PetDebugScreenProps) {
  const { token } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [localServerRunning, setLocalServerRunning] = useState(false);
  const debugStoreRef = useRef<Store | null>(null);

  // Save preference when it changes
  const setUseLocalServerPersisted = async (value: boolean) => {
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
  const [localServerProcess, setLocalServerProcess] = useState<Child | null>(null);
  const [collectionInfo, setCollectionInfo] = useState<string | null>(null);
  const [showMemoriesModal, setShowMemoriesModal] = useState(false);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [memoriesNextOffset, setMemoriesNextOffset] = useState<string | null>(null);
  const [memoriesLoading, setMemoriesLoading] = useState(false);
  const [prodServerStatus, setProdServerStatus] = useState<'unknown' | 'online' | 'offline'>('unknown');
  const [isDigesting, setIsDigesting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const processRef = useRef<Child | null>(null);
  const startupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const serverUrl = useLocalServer ? 'http://localhost:3001' : getApiBaseUrl();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Check server status on mount and mode change
  useEffect(() => {
    if (useLocalServer) {
      checkLocalServer(true);
    } else {
      checkProdServer();
    }
  }, [useLocalServer]);

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

  // Keep ref in sync with state for cleanup
  useEffect(() => {
    processRef.current = localServerProcess;
  }, [localServerProcess]);

  // Cleanup on unmount (use ref to avoid stale closure)
  useEffect(() => {
    return () => {
      processRef.current?.kill();
    };
  }, []);

  const addSystemMessage = (content: string) => {
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role: 'system',
      content,
      timestamp: new Date(),
    }]);
  };

  const checkLocalServer = async (silent = false) => {
    try {
      // Check via health endpoint
      const response = await fetch('http://localhost:3001/health', {
        signal: AbortSignal.timeout(2000)
      });
      const running = response.ok;
      setLocalServerRunning(running);
      if (!silent) {
        addSystemMessage(running ? 'Server local: Running ✓' : 'Server local: Not responding');
      }
      return running;
    } catch {
      setLocalServerRunning(false);
      if (!silent) {
        addSystemMessage('Server local: Not responding');
      }
      return false;
    }
  };

  const checkExistingProcess = async (): Promise<boolean> => {
    try {
      // Match specifically the server path to avoid matching client dev server
      const cmd = Command.create('exec-sh', ['-c', 'ps aux | grep -E "organizer/server.*(tsx|node).*index" | grep -v grep']);
      const output = await cmd.execute();
      const hasProcess = output.stdout.trim().length > 0;
      if (hasProcess) {
        addSystemMessage(`Process trouvé:\n${output.stdout.trim()}`);
      }
      return hasProcess;
    } catch {
      return false;
    }
  };

  const checkMongoDB = async (): Promise<boolean> => {
    try {
      const cmd = Command.create('exec-sh', ['-c', 'lsof -i :27017 | grep -q LISTEN']);
      const output = await cmd.execute();
      return output.code === 0;
    } catch {
      return false;
    }
  };

  const startLocalServer = async () => {
    // First check if already running
    const isRunning = await checkLocalServer(true);
    if (isRunning) {
      addSystemMessage('Server local déjà en cours sur :3001');
      setLocalServerRunning(true);
      return;
    }

    // Check MongoDB
    const mongoRunning = await checkMongoDB();
    if (!mongoRunning) {
      addSystemMessage('MongoDB non détecté sur :27017. Lance: brew services start mongodb-community');
      return;
    }

    // Check for existing process
    const hasProcess = await checkExistingProcess();
    if (hasProcess) {
      addSystemMessage('Process serveur détecté mais pas de réponse sur :3001. Kill manuel requis.');
      return;
    }

    addSystemMessage('Démarrage du serveur local...');

    try {
      const cmd = Command.create('exec-sh', [
        '-c',
        'cd /Users/mickaelfm/projects/perso/organizer/server && npm run dev'
      ]);

      cmd.stdout.on('data', (line) => {
        if (!line.trim()) return; // Skip empty lines
        console.log('[LocalServer stdout]', line);
        addSystemMessage(`[stdout] ${line}`);
        if (line.includes('listening') || line.includes('3001')) {
          setLocalServerRunning(true);
        }
      });

      cmd.stderr.on('data', (line) => {
        if (!line.trim()) return; // Skip empty lines
        console.error('[LocalServer stderr]', line);
        addSystemMessage(`[stderr] ${line}`);
      });

      const child = await cmd.spawn();
      setLocalServerProcess(child);

      // Wait a bit and check if it started
      startupTimeoutRef.current = setTimeout(async () => {
        startupTimeoutRef.current = null;
        const running = await checkLocalServer(true);
        if (running) {
          setLocalServerRunning(true);
          addSystemMessage('Server local prêt');
        } else {
          addSystemMessage('Server pas encore prêt après 3s - vérifie les logs stderr');
        }
      }, 3000);

    } catch (error) {
      addSystemMessage(`Erreur démarrage: ${error}`);
    }
  };

  const stopLocalServer = async () => {
    // Cancel pending startup check
    if (startupTimeoutRef.current) {
      clearTimeout(startupTimeoutRef.current);
      startupTimeoutRef.current = null;
    }

    // Kill tracked process if exists
    if (localServerProcess) {
      await localServerProcess.kill();
      setLocalServerProcess(null);
    }

    // Always also pkill any external processes
    try {
      const cmd = Command.create('exec-sh', ['-c', 'pkill -f "organizer/server.*(tsx|node).*index"']);
      await cmd.execute();
    } catch {
      // No process to kill, that's fine
    }

    setLocalServerRunning(false);
    addSystemMessage('Server local arrêté');
  };

  const forceKillServer = async () => {
    addSystemMessage('Force kill server processes...');
    try {
      const cmd = Command.create('exec-sh', ['-c', 'pkill -9 -f "organizer/server.*(tsx|node)"']);
      await cmd.execute();
      addSystemMessage('Processes killed');
    } catch {
      addSystemMessage('No process to kill');
    }
    setLocalServerProcess(null);
    setLocalServerRunning(false);
    // Recheck after a moment
    setTimeout(() => checkLocalServer(true), 500);
  };

  const toggleLocalServer = async () => {
    // Always check real state first
    const isActuallyRunning = await checkLocalServer(true);
    if (isActuallyRunning) {
      await stopLocalServer();
    } else {
      await startLocalServer();
    }
  };

  const getAuthHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    // Skip auth for local server (dev mode only)
    if (token && !useLocalServer) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
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

      const petMessage: Message = {
        id: crypto.randomUUID(),
        role: 'pet',
        content: data.response,
        expression: data.expression,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, petMessage]);
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

  const clearMessages = () => {
    setMessages([]);
  };

  const resetSession = async () => {
    try {
      const response = await fetch(`${serverUrl}/agent/reset`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        setMessages([]);
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

  const openMemoriesModal = async () => {
    setShowMemoriesModal(true);
    setMemories([]);
    setMemoriesNextOffset(null);
    await loadMemories(null);
  };

  const loadMemories = async (offset: string | null) => {
    setMemoriesLoading(true);
    try {
      const url = offset
        ? `${serverUrl}/agent/memory/list?limit=20&offset=${offset}`
        : `${serverUrl}/agent/memory/list?limit=20`;
      const response = await fetch(url, { headers: getAuthHeaders() });
      if (response.ok) {
        const data = await response.json();
        setMemories((prev) => (offset ? [...prev, ...data.memories] : data.memories));
        setMemoriesNextOffset(data.nextOffset);
      } else {
        addSystemMessage(`Erreur chargement mémoires: HTTP ${response.status}`);
      }
    } catch {
      addSystemMessage('Erreur réseau: impossible de charger les mémoires');
    } finally {
      setMemoriesLoading(false);
    }
  };

  const deleteMemoryItem = async (id: string) => {
    try {
      const response = await fetch(`${serverUrl}/agent/memory/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        setMemories((prev) => prev.filter((m) => m.id !== id));
      } else {
        addSystemMessage(`Erreur suppression: HTTP ${response.status}`);
      }
    } catch {
      addSystemMessage('Erreur réseau: impossible de supprimer');
    }
  };

  const formatMemoriesForExport = (items: MemoryItem[]) => {
    return items.map(m => {
      const date = new Date(m.payload.timestamp).toLocaleString('fr-FR');
      const author = m.payload.authorName || m.payload.type;
      return `[${date}] ${author}: ${m.payload.content}`;
    }).join('\n');
  };

  const exportMemories = async (count: 'last10' | 'all') => {
    const toExport = count === 'last10' ? memories.slice(0, 10) : memories;
    if (toExport.length === 0) {
      addSystemMessage('Aucune mémoire à exporter');
      return;
    }
    const text = formatMemoriesForExport(toExport);
    await writeText(text);
    addSystemMessage(`${toExport.length} mémoire(s) copiée(s)`);
  };

  const runDiagnostic = async () => {
    const mode = useLocalServer ? 'LOCAL' : 'PROD';
    addSystemMessage('Getting infos...');
    const results: string[] = [`=== DIAGNOSTIC (${mode}) ===`];

    if (useLocalServer) {
      // === LOCAL MODE CHECKS ===

      // 1. Check Docker
      try {
        const dockerCmd = Command.create('exec-sh', ['-c', 'docker --version']);
        const dockerOutput = await dockerCmd.execute();
        if (dockerOutput.code === 0) {
          results.push(`✓ Docker: ${dockerOutput.stdout.trim()}`);
        } else {
          results.push('✗ Docker: Non installé ou pas dans PATH');
        }
      } catch {
        results.push('✗ Docker: Non accessible');
      }

      // 2. Check Docker containers
      try {
        const dockerPsCmd = Command.create('exec-sh', ['-c', 'docker ps --format "{{.Names}}: {{.Status}}" 2>/dev/null']);
        const dockerPsOutput = await dockerPsCmd.execute();
        if (dockerPsOutput.code === 0 && dockerPsOutput.stdout.trim()) {
          results.push('✓ Docker containers:');
          dockerPsOutput.stdout.trim().split('\n').forEach(line => {
            results.push(`  - ${line}`);
          });
        } else {
          results.push('⚠ Docker: Aucun container actif');
        }
      } catch {
        results.push('✗ Docker: Impossible de lister les containers');
      }

      // 3. Check Qdrant local
      try {
        const qdrantRes = await fetch('http://localhost:6333/collections', { signal: AbortSignal.timeout(2000) });
        if (qdrantRes.ok) {
          const data = await qdrantRes.json();
          const collections = data.result?.collections?.map((c: { name: string }) => c.name) || [];
          results.push(`✓ Qdrant local: ${collections.length} collections`);
          if (collections.includes('organizer_memory')) {
            results.push('  ✓ Collection organizer_memory existe');
          } else {
            results.push('  ⚠ Collection organizer_memory manquante');
          }
        } else {
          results.push(`✗ Qdrant local: HTTP ${qdrantRes.status}`);
        }
      } catch {
        results.push('✗ Qdrant local: Non accessible sur localhost:6333');
      }

      // 4. Check MongoDB local
      try {
        const mongoCmd = Command.create('exec-sh', ['-c', 'mongosh mongodb://localhost:27017/organizer --quiet --eval "db.users.countDocuments()"']);
        const mongoOutput = await mongoCmd.execute();
        if (mongoOutput.code === 0) {
          const count = mongoOutput.stdout.trim();
          results.push(`✓ MongoDB local: ${count} user(s)`);
        } else {
          results.push('✗ MongoDB local: Erreur de connexion');
        }
      } catch {
        results.push('✗ MongoDB local: Non accessible');
      }

      // 5. Check local server
      try {
        const serverRes = await fetch('http://localhost:3001/health', { signal: AbortSignal.timeout(2000) });
        if (serverRes.ok) {
          results.push('✓ Server local: Running sur :3001');

          // Check auth bypass
          const testAuthRes = await fetch('http://localhost:3001/agent/memory/info', { signal: AbortSignal.timeout(2000) });
          if (testAuthRes.ok) {
            results.push('  ✓ DEV_SKIP_AUTH: Fonctionne');
          } else if (testAuthRes.status === 401) {
            results.push('  ✗ DEV_SKIP_AUTH: Auth requise (vérifier .env et restart server)');
          } else if (testAuthRes.status === 500) {
            results.push('  ✗ DEV_SKIP_AUTH: Erreur serveur interne (voir logs)');
          } else {
            results.push(`  ⚠ Test auth: HTTP ${testAuthRes.status} (voir logs serveur)`);
          }
        } else {
          results.push(`✗ Server local: HTTP ${serverRes.status}`);
        }
      } catch {
        results.push('✗ Server local: Non accessible sur :3001');
      }

      // 6. Check .env file
      try {
        const envCmd = Command.create('exec-sh', ['-c', 'cat /Users/mickaelfm/projects/perso/organizer/server/.env 2>/dev/null | grep -v "^#" | grep -v "^$"']);
        const envOutput = await envCmd.execute();
        if (envOutput.code === 0 && envOutput.stdout.trim()) {
          results.push('✓ server/.env:');
          envOutput.stdout.trim().split('\n').forEach(line => {
            const [key] = line.split('=');
            if (key?.includes('SECRET') || key?.includes('KEY')) {
              results.push(`  - ${key}=***`);
            } else {
              results.push(`  - ${line}`);
            }
          });
        } else {
          results.push('✗ server/.env: Fichier manquant ou vide');
        }
      } catch {
        results.push('✗ server/.env: Impossible de lire');
      }

    } else {
      // === PROD MODE CHECKS ===

      // 1. Check prod server + detailed health
      try {
        const healthRes = await fetch(`${serverUrl}/health/detailed`, { signal: AbortSignal.timeout(5000) });
        if (healthRes.ok) {
          const health = await healthRes.json();
          results.push(`✓ Server prod: ${serverUrl}`);

          // Qdrant status
          if (health.qdrant?.status === 'ok') {
            results.push(`✓ Qdrant: ${health.qdrant.points} mémoires (${health.qdrant.vector_size}d ${health.qdrant.distance})`);
          } else {
            results.push(`✗ Qdrant: ${health.qdrant?.error || 'Non accessible'}`);
          }

          // MongoDB status
          if (health.mongodb?.status === 'ok') {
            results.push(`✓ MongoDB: ${health.mongodb.users} user(s), ${health.mongodb.rooms} room(s)`);
          } else {
            results.push(`✗ MongoDB: ${health.mongodb?.error || 'Non accessible'}`);
          }
        } else {
          results.push(`✗ Server prod: HTTP ${healthRes.status}`);
        }
      } catch {
        results.push(`✗ Server prod: Non accessible (${serverUrl})`);
      }

      // 2. Check auth with token
      if (token) {
        results.push('✓ Token: Présent');
        try {
          const testAuthRes = await fetch(`${serverUrl}/agent/memory/info`, {
            headers: getAuthHeaders(),
            signal: AbortSignal.timeout(5000)
          });
          if (testAuthRes.ok) {
            results.push('  ✓ Auth: Token valide');
          } else if (testAuthRes.status === 401) {
            results.push('  ✗ Auth: Token invalide ou expiré');
          } else {
            results.push(`  ⚠ Auth: HTTP ${testAuthRes.status}`);
          }
        } catch {
          results.push('  ✗ Auth: Erreur réseau');
        }
      } else {
        results.push('✗ Token: Absent (non connecté?)');
      }

      // 3. Check agent endpoint
      try {
        const agentRes = await fetch(`${serverUrl}/agent/ask`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ question: 'ping' }),
          signal: AbortSignal.timeout(10000)
        });
        if (agentRes.ok) {
          results.push('✓ Agent endpoint: Répond');
        } else {
          results.push(`⚠ Agent endpoint: HTTP ${agentRes.status}`);
        }
      } catch {
        results.push('✗ Agent endpoint: Non accessible ou timeout');
      }
    }

    results.push(`=== FIN DIAGNOSTIC ===`);
    addSystemMessage(results.join('\n'));
  };

  const runDigest = async () => {
    if (isDigesting) return;
    setIsDigesting(true);
    addSystemMessage('Running digest...');
    try {
      const response = await fetch(`${serverUrl}/admin/digest`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        addSystemMessage(`Digest terminé: ${data.factsExtracted} faits extraits de ${data.messagesProcessed} messages`);
      } else {
        const error = await response.text();
        addSystemMessage(`Digest error: HTTP ${response.status} - ${error}`);
      }
    } catch (error) {
      addSystemMessage(`Digest error: ${error}`);
    } finally {
      setIsDigesting(false);
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
        <h2>Pet Debug</h2>
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
            <span className={`status-dot ${localServerRunning ? 'running' : 'stopped'}`} />
            <span>{localServerRunning ? 'Running' : 'Stopped'}</span>
            <button onClick={toggleLocalServer} title={localServerRunning ? 'Stop' : 'Start'}>
              <Power size={14} />
            </button>
            <button onClick={() => checkLocalServer()} title="Check status">
              <RefreshCw size={14} />
            </button>
            <button onClick={forceKillServer} title="Force kill all server processes">
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

      {/* Messages */}
      <div className="pet-debug-messages">
        {groupedMessages.map(group => {
          if (group.type === 'single') {
            const msg = group.message;
            return (
              <div key={msg.id} className={`debug-message ${msg.role}`}>
                <div className="message-header">
                  <span className="role">
                    {msg.role === 'user' ? 'You' : msg.role === 'pet' ? 'Pet' : 'System'}
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
      {/* Memories Modal */}
      {showMemoriesModal && (
        <div className="memories-modal-overlay" onClick={() => setShowMemoriesModal(false)}>
          <div className="memories-modal" onClick={(e) => e.stopPropagation()}>
            <div className="memories-modal-header">
              <h3>Mémoires ({memories.length})</h3>
              <button onClick={() => setShowMemoriesModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="memories-modal-content">
              {memories.length === 0 && !memoriesLoading && (
                <p className="no-memories">Aucune mémoire stockée</p>
              )}
              {memories.map((m) => (
                <div key={m.id} className="memory-item">
                  <div className="memory-info">
                    <span className="memory-date">
                      {new Date(m.payload.timestamp).toLocaleString('fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <span className="memory-author">{m.payload.authorName || m.payload.type}</span>
                  </div>
                  <div className="memory-content">{m.payload.content}</div>
                  <button
                    className="memory-delete"
                    onClick={() => deleteMemoryItem(m.id)}
                    title="Supprimer"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {memoriesLoading && <p className="memories-loading">Chargement...</p>}
            </div>
            <div className="memories-modal-footer">
              {memoriesNextOffset && !memoriesLoading && (
                <button onClick={() => loadMemories(memoriesNextOffset)}>
                  Charger plus...
                </button>
              )}
              <div className="memories-export-buttons">
                <button onClick={() => exportMemories('last10')} disabled={memories.length === 0}>
                  <Copy size={14} />
                  Last 10
                </button>
                <button onClick={() => exportMemories('all')} disabled={memories.length === 0}>
                  <Copy size={14} />
                  All
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Debug buttons */}
      <div className="debug-buttons">
        <button onClick={clearMessages} title="Clear messages">
          <Trash2 size={16} />
          Clear
        </button>
        <button onClick={resetSession} title="Reset pet session">
          Reset Session
        </button>
        <button onClick={checkQdrant} title="Check Qdrant collection">
          <Database size={16} />
          Qdrant Info
        </button>
        <button onClick={openMemoriesModal} title="Voir les mémoires stockées">
          <Brain size={16} />
          Mémoires
        </button>
        <button onClick={runDiagnostic} title="Diagnostic complet">
          🔍 Diagnostic
        </button>
        <button onClick={runDigest} disabled={isDigesting} title="Extraire les faits des messages live">
          <Zap size={16} />
          {isDigesting ? 'Digesting...' : 'Digest'}
        </button>
      </div>

      {/* Input */}
      <div className="pet-debug-input">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message au pet..."
          disabled={isLoading}
        />
        <button onClick={sendMessage} disabled={isLoading || !input.trim()}>
          <Send size={20} />
        </button>
      </div>
    </div>
  );
}
