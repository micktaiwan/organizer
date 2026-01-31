import React, { useState, useEffect, useRef } from 'react';
import { Power, RefreshCw, ChevronDown, ChevronUp, Trash2, Skull } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useServerConfig } from '../../contexts/ServerConfigContext';
import { useLocalServerControl } from '../../hooks/useLocalServerControl';

type AuthMode = 'login' | 'register';

export const AuthScreen: React.FC = () => {
  const { login, register, getSavedCredentials } = useAuth();
  const { selectedServer, resetConfig } = useServerConfig();
  const [mode, setMode] = useState<AuthMode>('login');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Local server control
  const [logsExpanded, setLogsExpanded] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const localServer = useLocalServerControl();
  const isLocalServer = selectedServer?.id === 'local';

  // Form fields
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Load saved credentials when component mounts or server changes
  useEffect(() => {
    const loadCredentials = async () => {
      if (selectedServer) {
        const saved = await getSavedCredentials(selectedServer.id);
        if (saved) {
          setUsername(saved.username);
          setEmail(saved.email || '');
          setDisplayName(saved.displayName || '');
        }
      }
    };
    loadCredentials();
  }, [selectedServer, getSavedCredentials]);

  // Check local server status when local server is selected
  useEffect(() => {
    if (isLocalServer) {
      localServer.checkStatus();
    }
  }, [isLocalServer]);

  // Auto-scroll logs
  useEffect(() => {
    if (logsExpanded && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [localServer.logs, logsExpanded]);

  // Expand logs panel when starting server
  const handleStartServer = async () => {
    setLogsExpanded(true);
    await localServer.startServer();
  };

  const resetForm = () => {
    setUsername('');
    setDisplayName('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setError(null);
  };

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    resetForm();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    console.log('=== DEBUG AUTH: handleSubmit appelé ===');
    console.log('Mode:', mode, 'Username:', username);

    if (mode === 'register') {
      if (password !== confirmPassword) {
        setError('Les mots de passe ne correspondent pas');
        return;
      }
      if (password.length < 6) {
        setError('Le mot de passe doit contenir au moins 6 caractères');
        return;
      }
    }

    setIsLoading(true);

    try {
      if (mode === 'login') {
        await login(username, password);
      } else {
        await register(username, displayName || username, email, password);
      }
    } catch (err) {
      // FORCER L'AFFICHAGE DE L'ERREUR BRUTE POUR DEBUGGING
      if (import.meta.env.DEV) {
        const rawError = err instanceof Error ? err.message : String(err);
        setError(`ERREUR BRUTE: ${rawError}`);
        setIsLoading(false);
        return;
      }

      // Améliorer les messages d'erreur
      let errorMessage = 'Une erreur est survenue';

      if (err instanceof Error) {
        const msg = err.message.toLowerCase();

        // Erreurs d'authentification
        if (msg.includes('invalid credentials') || msg.includes('identifiants invalides') || msg.includes('incorrect')) {
          errorMessage = 'Nom d\'utilisateur ou mot de passe incorrect';
        } else if (msg.includes('user not found') || msg.includes('utilisateur non trouvé')) {
          errorMessage = 'Nom d\'utilisateur ou mot de passe incorrect';
        } else if (msg.includes('username already exists') || msg.includes('existe déjà')) {
          errorMessage = 'Ce nom d\'utilisateur est déjà pris';
        } else if (msg.includes('email already exists')) {
          errorMessage = 'Cette adresse email est déjà utilisée';
        }
        // Erreurs réseau
        else if (msg.includes('fetch') || msg.includes('network') || msg.includes('réseau')) {
          errorMessage = 'Impossible de se connecter au serveur. Vérifiez votre connexion internet.';
        } else if (msg.includes('timeout')) {
          errorMessage = 'Le serveur ne répond pas. Veuillez réessayer.';
        }
        // Autres erreurs avec message du serveur
        else if (err.message) {
          errorMessage = err.message;
        }
      }

      // Afficher aussi l'erreur technique complète en mode dev
      if (err instanceof Error && import.meta.env.DEV) {
        setError(`${errorMessage}\n\n[DEBUG] ${err.message}`);
      } else {
        setError(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="container">
      <h1>Organizer Chat</h1>

      <div className="server-indicator" onClick={resetConfig}>
        <span className="server-label">Serveur:</span>
        <span className="server-name">{selectedServer?.name || 'Non configuré'}</span>
        <span className="server-change">Changer</span>
      </div>

      {/* Local Server Control Panel */}
      {isLocalServer && (
        <div className="local-server-panel">
          <div className="local-server-status">
            <span className={`status-dot ${localServer.isRunning ? 'running' : localServer.isStarting ? 'starting' : 'stopped'}`} />
            <span className="status-text">
              Serveur local: {localServer.isRunning ? 'Running' : localServer.isStarting ? 'Starting...' : 'Stopped'}
            </span>
            <div className="local-server-actions">
              {!localServer.isRunning && !localServer.isStarting && (
                <button
                  type="button"
                  className="btn-server-action btn-start"
                  onClick={handleStartServer}
                  title="Démarrer le serveur"
                >
                  <Power size={14} />
                  Démarrer
                </button>
              )}
              {(localServer.isRunning || localServer.isStarting) && (
                <button
                  type="button"
                  className="btn-server-action btn-stop"
                  onClick={localServer.stopServer}
                  title="Arrêter le serveur"
                >
                  <Power size={14} />
                  Stop
                </button>
              )}
              <button
                type="button"
                className="btn-server-action btn-refresh"
                onClick={localServer.checkStatus}
                title="Vérifier le status"
              >
                <RefreshCw size={14} />
              </button>
              <button
                type="button"
                className="btn-server-action btn-kill"
                onClick={localServer.forceKillServer}
                title="Force kill"
              >
                <Skull size={14} />
              </button>
              <button
                type="button"
                className="btn-server-action btn-toggle-logs"
                onClick={() => setLogsExpanded(!logsExpanded)}
                title={logsExpanded ? 'Masquer les logs' : 'Afficher les logs'}
              >
                {logsExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>
          </div>

          {/* Logs Panel */}
          {logsExpanded && (
            <div className="local-server-logs">
              <div className="logs-header">
                <span>Logs de démarrage</span>
                <button
                  type="button"
                  className="btn-clear-logs"
                  onClick={localServer.clearLogs}
                  title="Effacer les logs"
                >
                  <Trash2 size={12} />
                  Clear
                </button>
              </div>
              <div className="logs-content">
                {localServer.logs.length === 0 ? (
                  <div className="logs-empty">Aucun log</div>
                ) : (
                  localServer.logs.map(log => (
                    <div key={log.id} className={`log-entry log-${log.type}`}>
                      <span className="log-time">
                        {log.timestamp.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                      <span className="log-content">{log.content}</span>
                    </div>
                  ))
                )}
                <div ref={logsEndRef} />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="connection-box auth-box">
        <div className="auth-tabs">
          <button
            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => switchMode('login')}
            type="button"
          >
            Connexion
          </button>
          <button
            className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => switchMode('register')}
            type="button"
          >
            Inscription
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="auth-error" style={{ whiteSpace: 'pre-wrap' }}>{error}</div>}

          <div className="form-group">
            <label htmlFor="username">Nom d'utilisateur ou email</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="john_doe ou john@example.com"
              required
              autoFocus
              autoComplete="username"
            />
          </div>

          {mode === 'register' && (
            <>
              <div className="form-group">
                <label htmlFor="displayName">Nom affiché</label>
                <input
                  id="displayName"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="John Doe"
                  autoComplete="name"
                />
              </div>

              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="john@example.com"
                  required
                  autoComplete="email"
                />
              </div>
            </>
          )}

          <div className="form-group">
            <label htmlFor="password">Mot de passe</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          {mode === 'register' && (
            <div className="form-group">
              <label htmlFor="confirmPassword">Confirmer le mot de passe</label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="new-password"
              />
            </div>
          )}

          <button type="submit" disabled={isLoading} className="auth-submit">
            {isLoading
              ? 'Chargement...'
              : mode === 'login'
              ? 'Se connecter'
              : "S'inscrire"}
          </button>
        </form>
      </div>
    </main>
  );
};
