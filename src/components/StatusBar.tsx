import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { HardDrive, Users, Wifi, WifiOff, Activity, Shield, Globe, Cloud, Bot, Eye, Brain, MessageCircle, Pause, Clock, Ban, Check } from "lucide-react";
import { useSocketConnection } from "../contexts/SocketConnectionContext";
import { useUserStatus } from "../contexts/UserStatusContext";
import { getApiBaseUrl } from "../services/api";
import { socketService } from "../services/socket";
import { Tooltip } from "./Tooltip";
import type { EkoStats, EkoRateLimits } from "../types";
import "./StatusBar.css";

type EkoStatus = 'idle' | 'observing' | 'thinking';

interface DiskSpace {
  free_gb: number;
  total_gb: number;
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
  const [ping, setPing] = useState<number | null>(null);
  const [ekoStatus, setEkoStatus] = useState<EkoStatus>('idle');
  const [ekoStats, setEkoStats] = useState<EkoStats | null>(null);
  const [showEkoPanel, setShowEkoPanel] = useState(false);
  const [reflectionText, setReflectionText] = useState<string | null>(null);
  const [reflectionFading, setReflectionFading] = useState(false);
  const [reflectionIsPass, setReflectionIsPass] = useState(false);
  const { isConnected, status } = useSocketConnection();
  const { statuses } = useUserStatus();
  const pingInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const ekoPanelRef = useRef<HTMLDivElement>(null);
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

  // Close panel on click outside
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

      {serverDiskSpace && (
        <Tooltip content="Espace disque serveur" position="top">
          <span className="status-bar-item disk server">
            <Cloud size={12} />
            {serverDiskSpace.free_gb.toFixed(serverDiskSpace.free_gb < 10 ? 1 : 0)} GB
          </span>
        </Tooltip>
      )}

      {diskSpace && (
        <Tooltip content="Espace disque local" position="top">
          <span className="status-bar-item disk local">
            <HardDrive size={12} />
            {diskSpace.free_gb.toFixed(diskSpace.free_gb < 10 ? 1 : 0)} GB
          </span>
        </Tooltip>
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
    </div>
  );
}
