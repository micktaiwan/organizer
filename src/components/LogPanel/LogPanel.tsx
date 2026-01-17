import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import './LogPanel.css';

const LOCAL_SERVER_URL = 'http://localhost:3001';

interface LogEntry {
  id: string;
  level: 'log' | 'error' | 'warn';
  message: string;
  timestamp: string;
}

export function LogPanel() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Connect to logs namespace on local server
    const socket = io(`${LOCAL_SERVER_URL}/logs`, {
      transports: ['websocket'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      setLogs((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          level: 'log',
          message: '[LogPanel] Connected to server',
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

    return () => {
      socket.disconnect();
    };
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (logsEndRef.current && !isMinimized) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isMinimized]);

  const clearLogs = () => setLogs([]);

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  if (isMinimized) {
    return (
      <div className="log-panel-minimized" onClick={() => setIsMinimized(false)}>
        <span className={`log-status ${isConnected ? 'connected' : 'disconnected'}`} />
        <span>Logs ({logs.length})</span>
      </div>
    );
  }

  return (
    <div className="log-panel">
      <div className="log-panel-header">
        <div className="log-panel-title">
          <span className={`log-status ${isConnected ? 'connected' : 'disconnected'}`} />
          <span>Server Logs</span>
        </div>
        <div className="log-panel-actions">
          <button onClick={clearLogs} title="Clear logs">
            Clear
          </button>
          <button onClick={() => setIsMinimized(true)} title="Minimize">
            _
          </button>
        </div>
      </div>
      <div className="log-panel-content">
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
