import { WifiOff, Loader2 } from 'lucide-react';
import { useSocketConnection } from '../../contexts/SocketConnectionContext';
import './ConnectionBanner.css';

export const ConnectionBanner = () => {
  const { isConnected, status, errorMessage } = useSocketConnection();

  // Don't show anything when connected
  if (isConnected) {
    return null;
  }

  const isReconnecting = status === 'disconnected';
  const isError = status === 'error';

  return (
    <div className={`connection-banner ${isError ? 'error' : 'warning'}`}>
      <div className="connection-banner-content">
        {isReconnecting ? (
          <Loader2 className="connection-banner-icon spinning" size={16} />
        ) : (
          <WifiOff className="connection-banner-icon" size={16} />
        )}
        <span className="connection-banner-text">
          {isReconnecting
            ? 'Connexion perdue. Reconnexion en cours...'
            : errorMessage || 'Erreur de connexion au serveur'}
        </span>
      </div>
    </div>
  );
};
