import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { HardDrive, Users, Wifi, WifiOff, Activity, Shield, Globe, Cloud } from "lucide-react";
import { useSocketConnection } from "../contexts/SocketConnectionContext";
import { useUserStatus } from "../contexts/UserStatusContext";
import { getApiBaseUrl } from "../services/api";
import { Tooltip } from "./Tooltip";
import "./StatusBar.css";

interface DiskSpace {
  free_gb: number;
  total_gb: number;
}

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

interface StatusBarProps {
  onOpenAdmin?: () => void;
  onChangeServer?: () => void;
  serverName?: string;
}

export function StatusBar({ onOpenAdmin, onChangeServer, serverName }: StatusBarProps) {
  const [diskSpace, setDiskSpace] = useState<DiskSpace | null>(null);
  const [serverDiskSpace, setServerDiskSpace] = useState<DiskSpace | null>(null);
  const [ping, setPing] = useState<number | null>(null);
  const { isConnected, status } = useSocketConnection();
  const { statuses } = useUserStatus();
  const pingInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const onlineCount = Array.from(statuses.values()).filter(u => u.isOnline && !u.isBot).length;

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
