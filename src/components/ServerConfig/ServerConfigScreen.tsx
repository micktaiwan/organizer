import { useState } from 'react';
import { useServerConfig, ServerConfig } from '../../contexts/ServerConfigContext';

export function ServerConfigScreen() {
  const {
    servers,
    addServer,
    updateServer,
    deleteServer,
    selectServer,
    testConnection,
  } = useServerConfig();

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingServer, setEditingServer] = useState<ServerConfig | null>(null);
  const [formName, setFormName] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, boolean | null>>({});
  const [error, setError] = useState('');

  const handleAdd = () => {
    setEditingServer(null);
    setFormName('');
    setFormUrl('');
    setError('');
    setShowAddForm(true);
  };

  const handleEdit = (e: React.MouseEvent, server: ServerConfig) => {
    e.stopPropagation();
    setEditingServer(server);
    setFormName(server.name);
    setFormUrl(server.url);
    setError('');
    setShowAddForm(true);
  };

  const handleDelete = (e: React.MouseEvent, serverId: string) => {
    e.stopPropagation();
    deleteServer(serverId);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formName.trim() || !formUrl.trim()) {
      setError('Nom et URL requis');
      return;
    }

    try {
      new URL(formUrl);
    } catch {
      setError('URL invalide');
      return;
    }

    if (editingServer) {
      await updateServer(editingServer.id, formName.trim(), formUrl.trim());
    } else {
      await addServer(formName.trim(), formUrl.trim());
    }

    setShowAddForm(false);
    setEditingServer(null);
  };

  const handleTest = async (e: React.MouseEvent, server: ServerConfig) => {
    e.stopPropagation();
    setTestingId(server.id);
    setTestResults(prev => ({ ...prev, [server.id]: null }));

    const result = await testConnection(server.url);
    setTestResults(prev => ({ ...prev, [server.id]: result }));
    setTestingId(null);
  };

  const handleSelect = async (server: ServerConfig) => {
    // Sélectionne et passe directement à l'écran suivant
    await selectServer(server.id);
  };

  const getStatusIcon = (serverId: string) => {
    if (testingId === serverId) return '...';
    if (testResults[serverId] === true) return '✓';
    if (testResults[serverId] === false) return '✗';
    return '⚡';
  };

  const getStatusClass = (serverId: string) => {
    if (testResults[serverId] === true) return 'status-ok';
    if (testResults[serverId] === false) return 'status-error';
    return '';
  };

  return (
    <div className="server-config-screen">
      <div className="server-config-box">
        <h1>Configuration Serveur</h1>
        <p className="server-config-subtitle">
          Cliquez sur un serveur pour vous y connecter
        </p>

        <div className="server-list">
          {servers.map(server => (
            <div
              key={server.id}
              className="server-item"
              onClick={() => handleSelect(server)}
            >
              <div className="server-info">
                <div className="server-name">{server.name}</div>
                <div className="server-url">{server.url}</div>
              </div>

              <div className="server-actions">
                <button
                  className={`server-action-btn test ${getStatusClass(server.id)}`}
                  onClick={(e) => handleTest(e, server)}
                  disabled={testingId !== null}
                  title="Tester la connexion"
                >
                  {getStatusIcon(server.id)}
                </button>
                <button
                  className="server-action-btn edit"
                  onClick={(e) => handleEdit(e, server)}
                  title="Modifier"
                >
                  ✏️
                </button>
                {servers.length > 1 && (
                  <button
                    className="server-action-btn delete"
                    onClick={(e) => handleDelete(e, server.id)}
                    title="Supprimer"
                  >
                    🗑️
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <button className="add-server-btn" onClick={handleAdd}>
          + Ajouter un serveur
        </button>

        {showAddForm && (
          <div className="server-form-overlay">
            <form className="server-form" onSubmit={handleSubmit}>
              <h3>{editingServer ? 'Modifier le serveur' : 'Nouveau serveur'}</h3>

              {error && <div className="server-form-error">{error}</div>}

              <div className="form-group">
                <label htmlFor="server-name">Nom</label>
                <input
                  id="server-name"
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="Ex: Production"
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label htmlFor="server-url">URL</label>
                <input
                  id="server-url"
                  type="text"
                  value={formUrl}
                  onChange={e => setFormUrl(e.target.value)}
                  placeholder="Ex: http://localhost:3001"
                />
              </div>

              <div className="server-form-actions">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setShowAddForm(false)}
                >
                  Annuler
                </button>
                <button type="submit" className="btn-save">
                  {editingServer ? 'Enregistrer' : 'Ajouter'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
