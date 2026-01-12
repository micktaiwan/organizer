import React, { createContext, useContext, useState, useEffect } from 'react';
import { socketService } from '../services/socket';

type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

interface SocketConnectionContextType {
  isConnected: boolean;
  status: ConnectionStatus;
  errorMessage: string | null;
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

  useEffect(() => {
    // Check initial connection state
    if (socketService.isConnected) {
      setStatus('connected');
      setErrorMessage(null);
    }

    const unsubConnected = socketService.on('internal:connected', () => {
      console.log('SocketConnectionContext: connected');
      setStatus('connected');
      setErrorMessage(null);
    });

    const unsubDisconnected = socketService.on('internal:disconnected', (reason: unknown) => {
      console.log('SocketConnectionContext: disconnected', reason);
      setStatus('disconnected');
      setErrorMessage(typeof reason === 'string' ? reason : 'Connexion perdue');
    });

    const unsubError = socketService.on('internal:error', (error: unknown) => {
      console.log('SocketConnectionContext: error', error);
      setStatus('error');
      setErrorMessage(typeof error === 'string' ? error : 'Erreur de connexion');
    });

    return () => {
      unsubConnected();
      unsubDisconnected();
      unsubError();
    };
  }, []);

  const isConnected = status === 'connected';

  return (
    <SocketConnectionContext.Provider value={{ isConnected, status, errorMessage }}>
      {children}
    </SocketConnectionContext.Provider>
  );
};
