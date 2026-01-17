import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useServerConfig } from '../../contexts/ServerConfigContext';

type AuthMode = 'login' | 'register';

export const AuthScreen: React.FC = () => {
  const { login, register, getSavedCredentials } = useAuth();
  const { selectedServer, resetConfig } = useServerConfig();
  const [mode, setMode] = useState<AuthMode>('login');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
            <label htmlFor="username">Nom d'utilisateur</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="john_doe"
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
