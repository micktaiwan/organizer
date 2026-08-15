import React, { useEffect, useState } from "react";
import { WifiOff, RefreshCw } from "lucide-react";
import { useSocketConnection } from "../../contexts/SocketConnectionContext";
import "./ConnectionBanner.css";

// Délai de grâce : les micro-coupures (< 4 s) se réparent seules, inutile de
// faire clignoter une bannière pour ça.
const GRACE_MS = 4000;

const formatDuration = (ms: number): string => {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
};

export const ConnectionBanner: React.FC = () => {
  const { isConnected, status, disconnectedSince, reconnect } = useSocketConnection();
  const [now, setNow] = useState(() => Date.now());
  const [retrying, setRetrying] = useState(false);

  // Tick 1 s uniquement pendant une coupure
  useEffect(() => {
    if (isConnected || disconnectedSince === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isConnected, disconnectedSince]);

  useEffect(() => {
    if (isConnected) setRetrying(false);
  }, [isConnected]);

  if (isConnected || disconnectedSince === null) return null;

  const downFor = now - disconnectedSince;
  if (downFor < GRACE_MS) return null;

  const handleRetry = () => {
    setRetrying(true);
    reconnect();
    setTimeout(() => setRetrying(false), 3000);
  };

  return (
    <div className={`connection-banner ${status}`} role="status" aria-live="polite">
      <WifiOff size={16} className="connection-banner-icon" />
      <span className="connection-banner-text">
        <strong>Déconnecté du serveur depuis {formatDuration(downFor)}.</strong>{" "}
        Tu ne reçois plus les nouveaux messages.
      </span>
      <button
        className="connection-banner-retry"
        onClick={handleRetry}
        disabled={retrying}
        type="button"
      >
        <RefreshCw size={13} className={retrying ? "spinning" : ""} />
        {retrying ? "Reconnexion…" : "Réessayer"}
      </button>
    </div>
  );
};
