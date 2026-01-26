import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { HardDrive, Users, Wifi, WifiOff, Activity, Shield, Globe, Cloud, Bot, Eye, Brain, MessageCircle, Pause, Clock, Ban, Check, MemoryStick } from "lucide-react";
import { useSocketConnection } from "../contexts/SocketConnectionContext";
import { useUserStatus } from "../contexts/UserStatusContext";
import { getApiBaseUrl } from "../services/api";
import { socketService } from "../services/socket";
import { Tooltip } from "./Tooltip";
import { ProcessDetailsPanel } from "./ProcessDetailsPanel";
import type { EkoStats, EkoRateLimits } from "../types";
import "./StatusBar.css";

type EkoStatus = 'idle' | 'observing' | 'thinking';

interface DiskSpace {
  free_gb: number;
  total_gb: number;
}

interface DiskSpaceDetailed {
  total_gb: number;
  available_gb: number;
  available_with_purgeable_gb: number;
  purgeable_gb: number;
  used_gb: number;
}

interface MemoryInfo {
  total_gb: number;
  used_gb: number;
  available_gb: number;
  free_gb: number;
  app_gb: number;
  wired_gb: number;
  compressed_gb: number;
  cached_gb: number;
  swap_total_gb: number;
  swap_used_gb: number;
}

interface ProcessMemory {
  pid: number;
  name: string;
  cwd: string | null; // Current working directory (last segment only)
  memory_mb: number;
  virtual_mb: number;
}

interface ServerStatus {
  disk: { total_gb: number; used_gb: number; free_gb: number };
  memory: { total_gb: number; used_gb: number; free_gb: number; available_gb: number };
  containers: { name: string; cpu: string; memory: string }[];
  top_dirs: { path: string; size_gb: number }[];
}

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

interface StatusBarProps {
  onOpenAdmin?: () => void;
  onChangeServer?: () => void;
  serverName?: string;
  currentRoomId?: string | null;
}

export function StatusBar({ onOpenAdmin, onChangeServer, serverName, currentRoomId }: StatusBarProps) {
  const [diskSpace, setDiskSpace] = useState<DiskSpace | null>(null);
  const [serverDiskSpace, setServerDiskSpace] = useState<DiskSpace | null>(null);
  const [memoryInfo, setMemoryInfo] = useState<MemoryInfo | null>(null);
  const [topProcesses, setTopProcesses] = useState<ProcessMemory[]>([]);
  const [processRankChanges, setProcessRankChanges] = useState<Map<number, number>>(new Map());
  const prevProcessRanksRef = useRef<Map<number, number>>(new Map());
  const [showMemoryPanel, setShowMemoryPanel] = useState(false);
  const [ping, setPing] = useState<number | null>(null);
  const [ekoStatus, setEkoStatus] = useState<EkoStatus>('idle');
  const [ekoStats, setEkoStats] = useState<EkoStats | null>(null);
  const [showEkoPanel, setShowEkoPanel] = useState(false);
  const [showDiskPanel, setShowDiskPanel] = useState(false);
  const [diskSpaceDetailed, setDiskSpaceDetailed] = useState<DiskSpaceDetailed | null>(null);
  const [showServerDiskPanel, setShowServerDiskPanel] = useState(false);
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [serverStatusLoading, setServerStatusLoading] = useState(false);
  const [selectedProcessPid, setSelectedProcessPid] = useState<number | null>(null);
  const [reflectionText, setReflectionText] = useState<string | null>(null);
  const [reflectionFading, setReflectionFading] = useState(false);
  const [reflectionIsPass, setReflectionIsPass] = useState(false);
  const { isConnected, status } = useSocketConnection();
  const { statuses } = useUserStatus();
  const pingInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const ekoPanelRef = useRef<HTMLDivElement>(null);
  const diskPanelRef = useRef<HTMLDivElement>(null);
  const memoryPanelRef = useRef<HTMLDivElement>(null);
  const serverDiskPanelRef = useRef<HTMLDivElement>(null);
  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onlineCount = Array.from(statuses.values()).filter(u => u.isOnline && !u.isBot).length;

  // Fetch Eko stats
  const fetchEkoStats = async () => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/reflection/status`);
      if (response.ok) {
        const data = await response.json();
        setEkoStats(data.stats);
      }
    } catch (err) {
      console.error('[StatusBar] Failed to fetch Eko stats:', err);
    }
  };

  // Fetch stats on mount and when status changes to idle (after reflection)
  useEffect(() => {
    if (isConnected) {
      fetchEkoStats();
    }
  }, [isConnected, ekoStatus]);

  // Close eko panel on click outside
  useEffect(() => {
    if (!showEkoPanel) return;
    const handleClick = (e: MouseEvent) => {
      if (ekoPanelRef.current && !ekoPanelRef.current.contains(e.target as Node)) {
        setShowEkoPanel(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showEkoPanel]);

  // Close disk panel on click outside
  useEffect(() => {
    if (!showDiskPanel) return;
    const handleClick = (e: MouseEvent) => {
      if (diskPanelRef.current && !diskPanelRef.current.contains(e.target as Node)) {
        setShowDiskPanel(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showDiskPanel]);

  // Close server disk panel on click outside
  useEffect(() => {
    if (!showServerDiskPanel) return;
    const handleClick = (e: MouseEvent) => {
      if (serverDiskPanelRef.current && !serverDiskPanelRef.current.contains(e.target as Node)) {
        setShowServerDiskPanel(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showServerDiskPanel]);

  // Fetch server status via SSH
  const fetchServerStatus = async () => {
    if (!isTauri()) return;
    setServerStatusLoading(true);
    try {
      const status = await invoke<ServerStatus>("get_server_status");
      setServerStatus(status);
    } catch (err) {
      console.error("[StatusBar] server status error:", err);
    } finally {
      setServerStatusLoading(false);
    }
  };

  // Close process details when memory panel closes
  useEffect(() => {
    if (!showMemoryPanel) {
      setSelectedProcessPid(null);
    }
  }, [showMemoryPanel]);

  // Close memory panel and process details on click outside both
  useEffect(() => {
    if (!showMemoryPanel) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      const inMemoryPanel = memoryPanelRef.current?.contains(target);
      const inProcessDetails = document.querySelector('.process-details-panel')?.contains(target);

      if (!inMemoryPanel && !inProcessDetails) {
        setShowMemoryPanel(false);
        setSelectedProcessPid(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showMemoryPanel]);

  // Fetch detailed disk space
  const fetchDiskSpaceDetailed = async () => {
    if (!isTauri()) return;
    try {
      const detailed = await invoke<DiskSpaceDetailed>("get_disk_space_detailed");
      setDiskSpaceDetailed(detailed);
    } catch (err) {
      console.error("[StatusBar] disk space detailed error:", err);
    }
  };

  // Eko status via Socket.io
  useEffect(() => {
    if (!isConnected) {
      setEkoStatus('idle');
      return;
    }

    const handleEkoStatus = (data: unknown) => {
      const payload = data as { status?: EkoStatus };
      if (payload?.status) {
        setEkoStatus(payload.status);
      }
    };

    const unsub = socketService.on('eko:status', handleEkoStatus);
    return () => {
      unsub();
    };
  }, [isConnected]);

  // Reflection updates via Socket.io
  useEffect(() => {
    if (!isConnected) return;

    const handleReflectionUpdate = (data: unknown) => {
      const payload = data as { stats?: EkoStats };
      if (payload?.stats) {
        console.log('[StatusBar] Reflection update received:', payload.stats.totalReflections);
        setEkoStats(payload.stats);
      }
    };

    const unsub = socketService.on('reflection:update', handleReflectionUpdate);
    return () => {
      unsub();
    };
  }, [isConnected]);

  // Reflection progress via Socket.io
  useEffect(() => {
    if (!isConnected) {
      setReflectionText(null);
      setReflectionFading(false);
      return;
    }

    const handleReflectionProgress = (data: unknown) => {
      const payload = data as { step: string; messages?: number; goals?: number; facts?: number; action?: string; reason?: string };

      // Clear any pending fade timeout
      if (fadeTimeoutRef.current) {
        clearTimeout(fadeTimeoutRef.current);
        fadeTimeoutRef.current = null;
      }
      setReflectionFading(false);
      setReflectionIsPass(false);

      switch (payload.step) {
        case 'gathering':
          setReflectionText('Gathering context...');
          break;
        case 'context':
          setReflectionText(`${payload.messages} msgs, ${payload.goals} goals, ${payload.facts} facts`);
          break;
        case 'thinking':
          setReflectionText('Thinking...');
          break;
        case 'done':
          setReflectionText(payload.reason || 'Done');
          setReflectionIsPass(payload.action === 'pass');
          // Start fade out after showing the result
          setReflectionFading(true);
          fadeTimeoutRef.current = setTimeout(() => {
            setReflectionText(null);
            setReflectionFading(false);
            setReflectionIsPass(false);
          }, 5000);
          break;
      }
    };

    const unsub = socketService.on('reflection:progress', handleReflectionProgress);
    return () => {
      unsub();
      if (fadeTimeoutRef.current) {
        clearTimeout(fadeTimeoutRef.current);
      }
    };
  }, [isConnected]);

  // Disk space (Tauri only)
  useEffect(() => {
    if (!isTauri()) return;

    const fetchDiskSpace = () => {
      invoke<DiskSpace>("get_disk_space")
        .then(setDiskSpace)
        .catch((err) => console.error("[StatusBar] disk space error:", err));
    };

    fetchDiskSpace();
    const interval = setInterval(fetchDiskSpace, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Memory info (Tauri only) - refresh faster when panel is open
  useEffect(() => {
    if (!isTauri()) return;

    const fetchMemoryInfo = () => {
      invoke<MemoryInfo>("get_memory_info")
        .then(setMemoryInfo)
        .catch((err) => console.error("[StatusBar] memory info error:", err));
    };

    fetchMemoryInfo();
    const interval = setInterval(fetchMemoryInfo, showMemoryPanel ? 1_000 : 10_000);
    return () => clearInterval(interval);
  }, [showMemoryPanel]);

  // Top processes (separate interval, slower refresh)
  useEffect(() => {
    if (!isTauri() || !showMemoryPanel) {
      setTopProcesses([]);
      setProcessRankChanges(new Map());
      prevProcessRanksRef.current = new Map();
      return;
    }

    const fetchTopProcesses = () => {
      invoke<ProcessMemory[]>("get_top_processes", { limit: 10 })
        .then((processes) => {
          // Compute rank changes by comparing with previous ranks
          const changes = new Map<number, number>();
          processes.forEach((proc, newIndex) => {
            const prevIndex = prevProcessRanksRef.current.get(proc.pid);
            if (prevIndex !== undefined && prevIndex !== newIndex) {
              changes.set(proc.pid, prevIndex - newIndex);
            }
          });
          setProcessRankChanges(changes);

          // Save current ranks for next comparison
          prevProcessRanksRef.current = new Map(processes.map((p, i) => [p.pid, i]));
          setTopProcesses(processes);
        })
        .catch((err) => console.error("[StatusBar] top processes error:", err));
    };

    fetchTopProcesses();
    const interval = setInterval(fetchTopProcesses, 3_000);
    return () => clearInterval(interval);
  }, [showMemoryPanel]);

  // Server disk space (fetch from API)
  useEffect(() => {
    if (!isConnected) {
      setServerDiskSpace(null);
      return;
    }

    const fetchServerDiskSpace = async () => {
      try {
        const response = await fetch(`${getApiBaseUrl()}/disk-space`);
        if (response.ok) {
          const data = await response.json();
          setServerDiskSpace(data);
        }
      } catch (err) {
        console.error("[StatusBar] server disk space error:", err);
      }
    };

    fetchServerDiskSpace();
    const interval = setInterval(fetchServerDiskSpace, 60_000);
    return () => clearInterval(interval);
  }, [isConnected]);

  // Ping latency via fetch round-trip (every 30s when connected)
  useEffect(() => {
    if (!isConnected) {
      setPing(null);
      return;
    }

    const measurePing = async () => {
      try {
        const start = performance.now();
        await fetch(`${getApiBaseUrl()}/health`, { method: 'HEAD', cache: 'no-store' });
        const latency = Math.round(performance.now() - start);
        setPing(latency);
      } catch {
        setPing(null);
      }
    };

    measurePing();
    pingInterval.current = setInterval(measurePing, 30_000);
    return () => {
      if (pingInterval.current) clearInterval(pingInterval.current);
    };
  }, [isConnected]);

  // Format rate limit status
  const getRateLimitStatus = (rateLimits: EkoRateLimits) => {
    if (rateLimits.canIntervene) {
      return { label: 'Ready', className: 'ready' };
    }
    if (rateLimits.cooldownRemaining) {
      return { label: `${rateLimits.cooldownRemaining}min`, className: 'cooldown' };
    }
    return { label: 'Max reached', className: 'maxed' };
  };

  return (
    <div className="status-bar">
      <Tooltip content="Version de l'application" position="top">
        <span className="status-bar-item version">
          v{__APP_VERSION__}
        </span>
      </Tooltip>

      <Tooltip content="État de la connexion au serveur" position="top">
        <span className={`status-bar-item connection ${status}`}>
          {isConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
          {status === 'connected' ? 'Connecté' : status === 'error' ? 'Erreur' : 'Reconnexion...'}
        </span>
      </Tooltip>

      {ping !== null && (
        <Tooltip content="Latence réseau" position="top">
          <span className="status-bar-item ping">
            <Activity size={12} />
            {ping} ms
          </span>
        </Tooltip>
      )}

      {onlineCount > 0 && (
        <Tooltip content="Utilisateurs en ligne" position="top">
          <span className="status-bar-item users">
            <Users size={12} />
            {onlineCount}
          </span>
        </Tooltip>
      )}

      <div className="eko-container" ref={ekoPanelRef}>
        <Tooltip content={`Eko: ${ekoStatus === 'idle' ? 'Clic = réfléchir, Clic droit = stats' : ekoStatus === 'observing' ? 'Observe le Lobby' : 'Réfléchit...'}`} position="top" disabled={showEkoPanel}>
          <button
            className={`status-bar-item eko ${ekoStatus}`}
            onClick={async () => {
              console.log('[StatusBar] Eko clicked, status:', ekoStatus, 'roomId:', currentRoomId);
              if (ekoStatus !== 'idle') return;
              try {
                const url = `${getApiBaseUrl()}/reflection/trigger`;
                console.log('[StatusBar] Triggering reflection:', url);
                const res = await fetch(url, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ roomId: currentRoomId }),
                });
                console.log('[StatusBar] Reflection response:', res.status);
              } catch (err) {
                console.error('[StatusBar] Failed to trigger reflection:', err);
              }
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              fetchEkoStats();
              setShowEkoPanel(!showEkoPanel);
            }}
            disabled={ekoStatus !== 'idle'}
          >
            {ekoStatus === 'idle' && <Bot size={12} />}
            {ekoStatus === 'observing' && <Eye size={12} />}
            {ekoStatus === 'thinking' && <Brain size={12} />}
            {ekoStatus === 'idle' ? 'Eko' : ekoStatus === 'observing' ? 'Observing' : 'Thinking'}
          </button>
        </Tooltip>

        {showEkoPanel && ekoStats && (
          <div className="eko-panel">
            <div className="eko-panel-header">
              <span>Eko Stats</span>
              <button onClick={() => setShowEkoPanel(false)}>&times;</button>
            </div>
            <div className="eko-panel-stats">
              <div className="stat-item">
                <span className="stat-value">{ekoStats.totalReflections}</span>
                <span className="stat-label">Total</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{ekoStats.messageCount}</span>
                <span className="stat-label">Messages</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{ekoStats.passCount}</span>
                <span className="stat-label">Pass</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{ekoStats.rateLimitedCount}</span>
                <span className="stat-label">Rate Limited</span>
              </div>
            </div>

            {ekoStats.rateLimits && (
              <div className="eko-panel-rate-limits">
                <div className="rate-limit-header">Rate Limits</div>
                <div className="rate-limit-items">
                  <button
                    className={`rate-limit-item ${getRateLimitStatus(ekoStats.rateLimits).className}`}
                    onClick={async () => {
                      if (!ekoStats.rateLimits.canIntervene) {
                        try {
                          await fetch(`${getApiBaseUrl()}/reflection/reset-cooldown`, { method: 'POST' });
                          fetchEkoStats();
                        } catch (err) {
                          console.error('[StatusBar] Failed to reset cooldown:', err);
                        }
                      }
                    }}
                    title={ekoStats.rateLimits.canIntervene ? '' : 'Clic pour reset cooldown'}
                  >
                    {ekoStats.rateLimits.canIntervene ? <Check size={12} /> : ekoStats.rateLimits.cooldownRemaining ? <Clock size={12} /> : <Ban size={12} />}
                    <span className="rate-limit-label">{getRateLimitStatus(ekoStats.rateLimits).label}</span>
                  </button>
                  <div className="rate-limit-item today">
                    <MessageCircle size={12} />
                    <span className="rate-limit-label">Today: {ekoStats.rateLimits.todayCount}/{ekoStats.rateLimits.maxPerDay}</span>
                  </div>
                </div>
              </div>
            )}

            {ekoStats.history.length > 0 && (
              <div className="eko-panel-history">
                <div className="eko-panel-history-title">Historique</div>
                {ekoStats.history.slice(0, 10).map((entry) => (
                  <div key={entry.id} className={`eko-history-entry ${entry.action === 'message' ? 'action-message' : 'pass'} ${entry.rateLimited ? 'rate-limited' : ''}`}>
                    <span className="eko-history-action">
                      {entry.rateLimited ? <Ban size={10} /> : entry.action === 'message' ? <MessageCircle size={10} /> : <Pause size={10} />}
                    </span>
                    <span className="eko-history-text">
                      {entry.action === 'message' ? entry.message : entry.reason}
                    </span>
                    <span className="eko-history-meta">
                      <span className="eko-history-date">
                        {new Date(entry.timestamp).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="eko-history-duration">{entry.durationMs}ms</span>
                      {entry.inputTokens !== undefined && (
                        <span className="eko-history-tokens">{entry.inputTokens}→{entry.outputTokens} tok</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {memoryInfo && (
        <div className="memory-container" ref={memoryPanelRef}>
          <Tooltip content={`RAM: ${memoryInfo.free_gb.toFixed(1)} GB free / ${memoryInfo.available_gb.toFixed(1)} GB available / ${memoryInfo.total_gb.toFixed(0)} GB total`} position="top" disabled={showMemoryPanel}>
            <button
              className="status-bar-item memory"
              onClick={() => setShowMemoryPanel(!showMemoryPanel)}
            >
              <MemoryStick size={12} />
              <span className={`memory-free ${memoryInfo.free_gb < 1 ? 'critical' : memoryInfo.free_gb < 2 ? 'warning' : ''}`}>{memoryInfo.free_gb.toFixed(1)}</span>
              <span className="memory-separator">/</span>
              <span className={`memory-available ${memoryInfo.available_gb < 2 ? 'critical' : memoryInfo.available_gb < 5 ? 'warning' : ''}`}>{memoryInfo.available_gb.toFixed(1)}</span>
              <span className="memory-separator">/</span>
              <span className="memory-total">{memoryInfo.total_gb.toFixed(0)} GB</span>
            </button>
          </Tooltip>

          {showMemoryPanel && (
            <div className="memory-panel">
              <div className="memory-panel-header">
                <span>Memory</span>
                <button onClick={() => setShowMemoryPanel(false)}>&times;</button>
              </div>
              <div className="memory-panel-content">
                <div className="memory-stat-row">
                  <span className="memory-stat-label">Total</span>
                  <span className="memory-stat-value">{memoryInfo.total_gb.toFixed(1)} GB</span>
                </div>
                <div className={`memory-stat-row ${memoryInfo.used_gb / memoryInfo.total_gb > 0.8 ? 'highlight-red' : ''}`}>
                  <span className="memory-stat-label">Used</span>
                  <span className="memory-stat-value">{memoryInfo.used_gb.toFixed(1)} GB</span>
                </div>
                <div className="memory-stat-row highlight-green">
                  <span className="memory-stat-label">Available</span>
                  <span className="memory-stat-value">{memoryInfo.available_gb.toFixed(1)} GB</span>
                </div>

                {/* Detailed breakdown (macOS only, values > 0) */}
                {(memoryInfo.app_gb > 0 || memoryInfo.wired_gb > 0) && (
                  <>
                    <div className="memory-section-title">Breakdown</div>
                    {memoryInfo.app_gb > 0 && (
                      <div className="memory-stat-row highlight-blue">
                        <span className="memory-stat-label">App</span>
                        <span className="memory-stat-value">{memoryInfo.app_gb.toFixed(1)} GB</span>
                      </div>
                    )}
                    {memoryInfo.wired_gb > 0 && (
                      <div className="memory-stat-row highlight-yellow">
                        <span className="memory-stat-label">Wired</span>
                        <span className="memory-stat-value">{memoryInfo.wired_gb.toFixed(1)} GB</span>
                      </div>
                    )}
                    {memoryInfo.compressed_gb > 0.1 && (
                      <div className="memory-stat-row highlight-orange">
                        <span className="memory-stat-label">Compressed</span>
                        <span className="memory-stat-value">{memoryInfo.compressed_gb.toFixed(1)} GB</span>
                      </div>
                    )}
                    {memoryInfo.cached_gb > 0.1 && (
                      <div className="memory-stat-row">
                        <span className="memory-stat-label">Cached</span>
                        <span className="memory-stat-value">{memoryInfo.cached_gb.toFixed(1)} GB</span>
                      </div>
                    )}
                    {memoryInfo.free_gb > 0 && (
                      <div className="memory-stat-row highlight-green">
                        <span className="memory-stat-label">Free</span>
                        <span className="memory-stat-value">{memoryInfo.free_gb.toFixed(1)} GB</span>
                      </div>
                    )}
                  </>
                )}

                <div className="memory-bar-container">
                  <div className="memory-bar memory-bar-stacked">
                    {memoryInfo.app_gb > 0 ? (
                      <>
                        <div className="memory-bar-app" style={{ width: `${(memoryInfo.app_gb / memoryInfo.total_gb) * 100}%` }} />
                        <div className="memory-bar-wired" style={{ width: `${(memoryInfo.wired_gb / memoryInfo.total_gb) * 100}%` }} />
                        <div className="memory-bar-compressed" style={{ width: `${(memoryInfo.compressed_gb / memoryInfo.total_gb) * 100}%` }} />
                      </>
                    ) : (
                      <div
                        className={`memory-bar-used ${memoryInfo.used_gb / memoryInfo.total_gb > 0.9 ? 'critical' : memoryInfo.used_gb / memoryInfo.total_gb > 0.8 ? 'warning' : ''}`}
                        style={{ width: `${(memoryInfo.used_gb / memoryInfo.total_gb) * 100}%` }}
                      />
                    )}
                  </div>
                </div>

                {memoryInfo.swap_total_gb > 0 && (
                  <>
                    <div className="memory-section-title">Swap</div>
                    <div className="memory-stat-row">
                      <span className="memory-stat-label">Total</span>
                      <span className="memory-stat-value">{memoryInfo.swap_total_gb.toFixed(1)} GB</span>
                    </div>
                    <div className={`memory-stat-row ${memoryInfo.swap_used_gb > 0.1 ? 'highlight-orange' : ''}`}>
                      <span className="memory-stat-label">Used</span>
                      <span className="memory-stat-value">{memoryInfo.swap_used_gb.toFixed(1)} GB</span>
                    </div>
                    {memoryInfo.swap_used_gb > 0.1 && (
                      <div className="memory-bar-container">
                        <div className="memory-bar">
                          <div
                            className="memory-bar-swap"
                            style={{ width: `${(memoryInfo.swap_used_gb / memoryInfo.swap_total_gb) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}

                {topProcesses.length > 0 && (
                  <>
                    <div className="memory-section-title">Top Processes</div>
                    <div className="memory-processes">
                      {topProcesses.map((proc) => {
                        const rankChange = processRankChanges.get(proc.pid) || 0;
                        return (
                          <div
                            key={proc.pid}
                            className="memory-process-row clickable"
                            onClick={() => setSelectedProcessPid(proc.pid)}
                          >
                            <span className="memory-process-rank">
                              {rankChange > 0 && <span className="rank-up">▲</span>}
                              {rankChange < 0 && <span className="rank-down">▼</span>}
                            </span>
                            <span className="memory-process-name" title={proc.cwd ? `${proc.name} [${proc.cwd}]` : proc.name}>
                              {proc.name}
                              {proc.cwd && <span className="memory-process-cwd">{proc.cwd}</span>}
                            </span>
                            <span className="memory-process-value">{proc.memory_mb >= 1024 ? `${(proc.memory_mb / 1024).toFixed(1)} GB` : `${proc.memory_mb.toFixed(0)} MB`}</span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {serverDiskSpace && (
        <div className="server-disk-container" ref={serverDiskPanelRef}>
          <Tooltip content="Espace disque serveur (clic pour détails)" position="top" disabled={showServerDiskPanel}>
            <button
              className="status-bar-item disk server"
              onClick={() => {
                fetchServerStatus();
                setShowServerDiskPanel(!showServerDiskPanel);
              }}
            >
              <Cloud size={12} />
              {serverDiskSpace.free_gb.toFixed(serverDiskSpace.free_gb < 10 ? 1 : 0)} GB
            </button>
          </Tooltip>

          {showServerDiskPanel && (
            <div className="server-disk-panel">
              <div className="disk-panel-header">
                <span>Server Status</span>
                <button onClick={() => setShowServerDiskPanel(false)}>&times;</button>
              </div>
              {serverStatusLoading ? (
                <div className="server-status-loading">
                  <div className="spinner" />
                  <span>Connecting via SSH...</span>
                </div>
              ) : serverStatus ? (
                <div className="server-status-content">
                  <div className="server-section">
                    <div className="server-section-title">Disk</div>
                    <div className="server-stat-row">
                      <span>Total</span>
                      <span>{serverStatus.disk.total_gb} GB</span>
                    </div>
                    <div className="server-stat-row">
                      <span>Used</span>
                      <span>{serverStatus.disk.used_gb} GB</span>
                    </div>
                    <div className="server-stat-row highlight-green">
                      <span>Free</span>
                      <span>{serverStatus.disk.free_gb} GB</span>
                    </div>
                    <div className="disk-bar-container">
                      <div className="disk-bar">
                        <div
                          className="disk-bar-used"
                          style={{ width: `${(serverStatus.disk.used_gb / serverStatus.disk.total_gb) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="server-section">
                    <div className="server-section-title">Memory</div>
                    <div className="server-stat-row">
                      <span>Total</span>
                      <span>{serverStatus.memory.total_gb} GB</span>
                    </div>
                    <div className="server-stat-row">
                      <span>Used</span>
                      <span>{serverStatus.memory.used_gb} GB</span>
                    </div>
                    <div className="server-stat-row highlight-green">
                      <span>Available</span>
                      <span>{serverStatus.memory.available_gb} GB</span>
                    </div>
                  </div>

                  {serverStatus.containers.length > 0 && (
                    <div className="server-section">
                      <div className="server-section-title">Containers ({serverStatus.containers.length})</div>
                      <div className="server-containers">
                        {[...serverStatus.containers].sort((a, b) => {
                          // Parse memory like "104.8MiB / 1.894GiB" -> extract first number in MiB
                          const parseMemory = (mem: string) => {
                            const match = mem.match(/^([\d.]+)(\w+)/);
                            if (!match) return 0;
                            const value = parseFloat(match[1]);
                            const unit = match[2].toLowerCase();
                            if (unit.includes('gib')) return value * 1024;
                            return value; // MiB
                          };
                          return parseMemory(b.memory) - parseMemory(a.memory);
                        }).map((c) => (
                          <div key={c.name} className="server-container-row">
                            <span className="container-name">{c.name}</span>
                            <span className="container-stats">{c.memory.split(' / ')[0]} | {c.cpu}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {serverStatus.top_dirs.length > 0 && (
                    <div className="server-section">
                      <div className="server-section-title">Top Directories</div>
                      {[...serverStatus.top_dirs]
                        .sort((a, b) => b.size_gb - a.size_gb)
                        .map((d) => (
                        <div key={d.path} className="server-stat-row">
                          <span className="dir-path">{d.path}</span>
                          <span>{d.size_gb.toFixed(2)} GB</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="server-status-error">Failed to fetch server status</div>
              )}
            </div>
          )}
        </div>
      )}

      {diskSpace && (
        <div className="disk-container" ref={diskPanelRef}>
          <Tooltip content="Espace disque local (clic pour détails)" position="top" disabled={showDiskPanel}>
            <button
              className="status-bar-item disk local"
              onClick={() => {
                fetchDiskSpaceDetailed();
                setShowDiskPanel(!showDiskPanel);
              }}
            >
              <HardDrive size={12} />
              {diskSpace.free_gb.toFixed(diskSpace.free_gb < 10 ? 1 : 0)} GB
            </button>
          </Tooltip>

          {showDiskPanel && diskSpaceDetailed && (
            <div className="disk-panel">
              <div className="disk-panel-header">
                <span>Local Disk Space</span>
                <button onClick={() => setShowDiskPanel(false)}>&times;</button>
              </div>
              <div className="disk-panel-content">
                <div className="disk-stat-row">
                  <span className="disk-stat-label">Total</span>
                  <span className="disk-stat-value">{diskSpaceDetailed.total_gb.toFixed(0)} GB</span>
                </div>
                <div className="disk-stat-row">
                  <span className="disk-stat-label">Used</span>
                  <span className="disk-stat-value">{diskSpaceDetailed.used_gb.toFixed(0)} GB</span>
                </div>
                <div className="disk-stat-row highlight-green">
                  <span className="disk-stat-label">Free (real)</span>
                  <span className="disk-stat-value">{diskSpaceDetailed.available_gb.toFixed(1)} GB</span>
                </div>
                {diskSpaceDetailed.purgeable_gb > 0.1 && (
                  <div className="disk-stat-row highlight-orange">
                    <span className="disk-stat-label">Purgeable</span>
                    <span className="disk-stat-value">+{diskSpaceDetailed.purgeable_gb.toFixed(1)} GB</span>
                  </div>
                )}
                {diskSpaceDetailed.purgeable_gb > 0.1 && (
                  <div className="disk-stat-row">
                    <span className="disk-stat-label">Free + Purg</span>
                    <span className="disk-stat-value">{diskSpaceDetailed.available_with_purgeable_gb.toFixed(1)} GB</span>
                  </div>
                )}
                <div className="disk-bar-container">
                  <div className="disk-bar">
                    <div
                      className="disk-bar-used"
                      style={{ width: `${(diskSpaceDetailed.used_gb / diskSpaceDetailed.total_gb) * 100}%` }}
                    />
                    {diskSpaceDetailed.purgeable_gb > 0.1 && (
                      <div
                        className="disk-bar-purgeable"
                        style={{ width: `${(diskSpaceDetailed.purgeable_gb / diskSpaceDetailed.total_gb) * 100}%` }}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {reflectionText && (
        <span className={`status-bar-item reflection-live ${reflectionFading ? 'fading' : ''} ${reflectionIsPass ? 'pass' : ''}`}>
          {reflectionIsPass ? <Pause size={12} /> : <Brain size={12} />}
          <span className="reflection-text">{reflectionText}</span>
        </span>
      )}

      <span className="status-bar-spacer" />

      {onOpenAdmin && (
        <Tooltip content="Ouvrir le panneau d'administration" position="top">
          <button className="status-bar-btn" onClick={onOpenAdmin}>
            <Shield size={14} />
          </button>
        </Tooltip>
      )}
      {onChangeServer && (
        <Tooltip content={serverName ? `Serveur: ${serverName}` : 'Changer de serveur'} position="top">
          <button className="status-bar-btn" onClick={onChangeServer}>
            <Globe size={14} />
          </button>
        </Tooltip>
      )}

      {selectedProcessPid !== null && (
        <ProcessDetailsPanel
          pid={selectedProcessPid}
          onClose={() => setSelectedProcessPid(null)}
        />
      )}
    </div>
  );
}
