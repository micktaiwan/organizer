import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { HardDrive, Users, Wifi, WifiOff, Activity } from "lucide-react";
import { useSocketConnection } from "../contexts/SocketConnectionContext";
import { useUserStatus } from "../contexts/UserStatusContext";
import { getApiBaseUrl } from "../services/api";
import "./StatusBar.css";

interface DiskSpace {
  free_gb: number;
  total_gb: number;
}

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function StatusBar() {
  const [diskSpace, setDiskSpace] = useState<DiskSpace | null>(null);
  const [ping, setPing] = useState<number | null>(null);
  const { isConnected, status } = useSocketConnection();
  const { statuses } = useUserStatus();
  const pingInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const onlineCount = Array.from(statuses.values()).filter(u => u.isOnline).length;

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
      <span className="status-bar-item version">
        v{__APP_VERSION__}
      </span>

      <span className={`status-bar-item connection ${status}`}>
        {isConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
        {status === 'connected' ? 'Connecté' : status === 'error' ? 'Erreur' : 'Reconnexion...'}
      </span>

      {ping !== null && (
        <span className="status-bar-item ping">
          <Activity size={12} />
          {ping} ms
        </span>
      )}

      {onlineCount > 0 && (
        <span className="status-bar-item users">
          <Users size={12} />
          {onlineCount}
        </span>
      )}

      {diskSpace && (
        <span className="status-bar-item disk">
          <HardDrive size={12} />
          {diskSpace.free_gb.toFixed(0)} GB
        </span>
      )}
    </div>
  );
}
