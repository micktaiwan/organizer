import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { useAuth } from '../../contexts/AuthContext';
import './LogPanel.css';

const LOCAL_SERVER_URL = 'http://localhost:3001';
const PROD_SERVER_URL = 'http://51.210.150.25:3001';

interface LogEntry {
  id: string;
  level: 'log' | 'error' | 'warn';
  message: string;
  timestamp: string;
}

interface LogPanelProps {
  useLocalServer: boolean;
  onClose: () => void;
}

export function LogPanel({ useLocalServer, onClose }: LogPanelProps) {
  const { token, user } = useAuth();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const isAdmin = user?.isAdmin ?? false;
  const serverUrl = useLocalServer ? LOCAL_SERVER_URL : PROD_SERVER_URL;
  const serverName = useLocalServer ? 'Local' : 'Prod';

  useEffect(() => {
    // Cleanup previous socket
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    // Only connect if user is admin and server is selected
    if (!token || !isAdmin || !serverUrl) {
      setAuthError(!serverUrl ? 'Aucun serveur sélectionné' : 'Accès réservé aux administrateurs');
      setIsConnected(false);
      return;
    }

    setAuthError(null);

    // Connect to logs namespace with auth token
    const socket = io(`${serverUrl}/logs`, {
      transports: ['websocket'],
      auth: { token },
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      setLogs((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          level: 'log',
          message: `[LogPanel] Connected to ${serverUrl}`,
          timestamp: new Date().toISOString(),
        },
      ]);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      setLogs((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          level: 'warn',
          message: '[LogPanel] Disconnected from server',
          timestamp: new Date().toISOString(),
        },
      ]);
    });

    socket.on('log', (entry: Omit<LogEntry, 'id'>) => {
      setLogs((prev) => {
        const newLogs = [...prev, { ...entry, id: Date.now().toString() + Math.random() }];
        // Keep only last 500 logs
        return newLogs.slice(-500);
      });
    });

    socket.on('connect_error', (error) => {
      setAuthError(error.message);
      setIsConnected(false);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, isAdmin, serverUrl]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const clearLogs = () => setLogs([]);

  const copyLogs = async () => {
    const text = logs
      .map((log) => `[${formatTime(log.timestamp)}] [${log.level.toUpperCase()}] ${log.message}`)
      .join('\n');
    await writeText(text);
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="log-panel">
      <div className="log-panel-header">
        <div className="log-panel-title">
          <span className={`log-status ${isConnected ? 'connected' : authError ? 'error' : 'disconnected'}`} />
          <span>{serverName} Logs</span>
        </div>
        <div className="log-panel-actions">
          <button onClick={copyLogs} title="Copy logs to clipboard">
            Copy
          </button>
          <button onClick={clearLogs} title="Clear logs">
            Clear
          </button>
          <button onClick={onClose} title="Close">
            ×
          </button>
        </div>
      </div>
      <div className="log-panel-content">
        {authError && (
          <div className="log-entry log-error">
            <span className="log-time">{formatTime(new Date().toISOString())}</span>
            <span className="log-message">[Auth] {authError}</span>
          </div>
        )}
        {logs.map((log) => (
          <div key={log.id} className={`log-entry log-${log.level}`}>
            <span className="log-time">{formatTime(log.timestamp)}</span>
            <span className="log-message">{log.message}</span>
          </div>
        ))}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}
