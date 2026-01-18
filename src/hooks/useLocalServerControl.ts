import { useState, useRef, useCallback, useEffect } from 'react';
import { Command, Child } from '@tauri-apps/plugin-shell';

export interface LogEntry {
  id: string;
  type: 'info' | 'stdout' | 'stderr' | 'error';
  content: string;
  timestamp: Date;
}

export interface UseLocalServerControlReturn {
  isRunning: boolean;
  isStarting: boolean;
  logs: LogEntry[];
  checkStatus: () => Promise<boolean>;
  startServer: () => Promise<void>;
  stopServer: () => Promise<void>;
  forceKillServer: () => Promise<void>;
  clearLogs: () => void;
}

export function useLocalServerControl(): UseLocalServerControlReturn {
  const [isRunning, setIsRunning] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [localServerProcess, setLocalServerProcess] = useState<Child | null>(null);

  const processRef = useRef<Child | null>(null);
  const startupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep ref in sync with state for cleanup
  useEffect(() => {
    processRef.current = localServerProcess;
  }, [localServerProcess]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      processRef.current?.kill();
      if (startupTimeoutRef.current) {
        clearTimeout(startupTimeoutRef.current);
      }
    };
  }, []);

  const addLog = useCallback((type: LogEntry['type'], content: string) => {
    setLogs(prev => [...prev, {
      id: crypto.randomUUID(),
      type,
      content,
      timestamp: new Date(),
    }]);
  }, []);

  const checkStatus = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch('http://localhost:3001/health', {
        signal: AbortSignal.timeout(2000)
      });
      const running = response.ok;
      setIsRunning(running);
      return running;
    } catch {
      setIsRunning(false);
      return false;
    }
  }, []);

  const checkMongoDB = async (): Promise<boolean> => {
    try {
      const cmd = Command.create('exec-sh', ['-c', 'lsof -i :27017 | grep -q LISTEN']);
      const output = await cmd.execute();
      return output.code === 0;
    } catch {
      return false;
    }
  };

  const checkExistingProcess = async (): Promise<{ found: boolean; details?: string }> => {
    try {
      // Match specifically the server path to avoid matching client dev server
      const cmd = Command.create('exec-sh', ['-c', 'ps aux | grep -E "organizer/server.*(tsx|node).*index" | grep -v grep']);
      const output = await cmd.execute();
      const hasProcess = output.stdout.trim().length > 0;
      return { found: hasProcess, details: hasProcess ? output.stdout.trim() : undefined };
    } catch {
      return { found: false };
    }
  };

  const startServer = useCallback(async () => {
    // First check if already running
    const running = await checkStatus();
    if (running) {
      addLog('info', 'Serveur local deja en cours sur :3001');
      setIsRunning(true);
      return;
    }

    setIsStarting(true);

    // Check MongoDB
    const mongoRunning = await checkMongoDB();
    if (!mongoRunning) {
      addLog('error', 'MongoDB non detecte sur :27017. Lance: brew services start mongodb-community');
      setIsStarting(false);
      return;
    }

    // Check for existing process
    const processCheck = await checkExistingProcess();
    if (processCheck.found) {
      addLog('info', `Process serveur detecte mais pas de reponse sur :3001.`);
      if (processCheck.details) {
        addLog('info', processCheck.details);
      }
      addLog('error', 'Kill manuel requis.');
      setIsStarting(false);
      return;
    }

    addLog('info', 'Demarrage du serveur local...');

    try {
      const cmd = Command.create('exec-sh', [
        '-c',
        'cd /Users/mickaelfm/projects/perso/organizer/server && npm run dev'
      ]);

      cmd.stdout.on('data', (line) => {
        if (!line.trim()) return;
        console.log('[LocalServer stdout]', line);
        addLog('stdout', line);
        if (line.includes('listening') || line.includes('3001')) {
          setIsRunning(true);
          setIsStarting(false);
        }
      });

      cmd.stderr.on('data', (line) => {
        if (!line.trim()) return;
        console.error('[LocalServer stderr]', line);
        addLog('stderr', line);
      });

      const child = await cmd.spawn();
      setLocalServerProcess(child);

      // Wait a bit and check if it started
      startupTimeoutRef.current = setTimeout(async () => {
        startupTimeoutRef.current = null;
        const isNowRunning = await checkStatus();
        if (isNowRunning) {
          setIsRunning(true);
          addLog('info', 'Serveur local pret');
        } else {
          addLog('error', 'Serveur pas encore pret apres 3s - verifie les logs stderr');
        }
        setIsStarting(false);
      }, 3000);

    } catch (error) {
      addLog('error', `Erreur demarrage: ${error}`);
      setIsStarting(false);
    }
  }, [checkStatus, addLog]);

  const stopServer = useCallback(async () => {
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

    setIsRunning(false);
    setIsStarting(false);
    addLog('info', 'Serveur local arrete');
  }, [localServerProcess, addLog]);

  const forceKillServer = useCallback(async () => {
    addLog('info', 'Force kill server processes...');

    // Cancel pending startup check
    if (startupTimeoutRef.current) {
      clearTimeout(startupTimeoutRef.current);
      startupTimeoutRef.current = null;
    }

    // Clear tracked process reference
    setLocalServerProcess(null);

    // Force kill with -9
    try {
      const cmd = Command.create('exec-sh', ['-c', 'pkill -9 -f "organizer/server.*(tsx|node)"']);
      await cmd.execute();
      addLog('info', 'Processes killed');
    } catch {
      addLog('info', 'No process to kill');
    }

    setIsRunning(false);
    setIsStarting(false);

    // Recheck after a moment
    setTimeout(async () => {
      await checkStatus();
    }, 500);
  }, [addLog, checkStatus]);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return {
    isRunning,
    isStarting,
    logs,
    checkStatus,
    startServer,
    stopServer,
    forceKillServer,
    clearLogs,
  };
}
