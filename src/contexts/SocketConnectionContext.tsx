import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { socketService } from '../services/socket';

type ConnectionStatus = 'connected' | 'connecting' | 'reconnecting' | 'disconnected' | 'error';

interface SocketConnectionContextType {
  isConnected: boolean;
  status: ConnectionStatus;
  errorMessage: string | null;
  /** Timestamp (ms) de la perte de connexion, null si connecté */
  disconnectedSince: number | null;
  /** Numéro de la tentative de reconnexion en cours (0 si aucune) */
  reconnectAttempt: number;
  /** Force une tentative immédiate sans attendre le backoff */
  reconnect: () => void;
}

const SocketConnectionContext = createContext<SocketConnectionContextType | null>(null);

export const useSocketConnection = () => {
  const context = useContext(SocketConnectionContext);
  if (!context) {
    throw new Error('useSocketConnection must be used within a SocketConnectionProvider');
  }
  return context;
};

interface SocketConnectionProviderProps {
  children: React.ReactNode;
}

export const SocketConnectionProvider: React.FC<SocketConnectionProviderProps> = ({ children }) => {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [disconnectedSince, setDisconnectedSince] = useState<number | null>(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  useEffect(() => {
    // Check initial connection state
    if (socketService.isConnected) {
      setStatus('connected');
      setErrorMessage(null);
    }

    // Marque le début de la coupure une seule fois, pour pouvoir afficher
    // depuis combien de temps on est muet.
    const markDown = () => setDisconnectedSince(prev => prev ?? Date.now());

    const unsubConnected = socketService.on('internal:connected', () => {
      console.log('SocketConnectionContext: connected');
      setStatus('connected');
      setErrorMessage(null);
      setDisconnectedSince(null);
      setReconnectAttempt(0);
    });

    const unsubDisconnected = socketService.on('internal:disconnected', (reason: unknown) => {
      console.log('SocketConnectionContext: disconnected', reason);
      setStatus('disconnected');
      setErrorMessage(typeof reason === 'string' ? reason : 'Connexion perdue');
      markDown();
    });

    const unsubReconnecting = socketService.on('internal:reconnecting', (attempt: unknown) => {
      setStatus('reconnecting');
      setReconnectAttempt(typeof attempt === 'number' ? attempt : 0);
      markDown();
    });

    const unsubError = socketService.on('internal:error', (error: unknown) => {
      console.log('SocketConnectionContext: error', error);
      setStatus('error');
      setErrorMessage(typeof error === 'string' ? error : 'Erreur de connexion');
      markDown();
    });

    return () => {
      unsubConnected();
      unsubDisconnected();
      unsubReconnecting();
      unsubError();
    };
  }, []);

  const isConnected = status === 'connected';

  const reconnect = useCallback(() => {
    socketService.forceReconnect();
  }, []);

  return (
    <SocketConnectionContext.Provider
      value={{ isConnected, status, errorMessage, disconnectedSince, reconnectAttempt, reconnect }}
    >
      {children}
    </SocketConnectionContext.Provider>
  );
};
