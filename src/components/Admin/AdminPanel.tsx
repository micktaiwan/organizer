import React, { useState, useEffect } from 'react';
import { api, AdminStats, AdminUser } from '../../services/api';

interface AdminPanelProps {
  onClose: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onClose }) => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [recentUsers, setRecentUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'stats' | 'users'>('stats');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    if (activeTab === 'users') {
      loadUsers(currentPage);
    }
  }, [activeTab, currentPage]);

  const loadStats = async () => {
    try {
      setIsLoading(true);
      const data = await api.getAdminStats();
      setStats(data.stats);
      setRecentUsers(data.recentUsers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setIsLoading(false);
    }
  };

  const loadUsers = async (page: number) => {
    try {
      setIsLoading(true);
      const data = await api.getAdminUsers(page);
      setUsers(data.users);
      setTotalPages(data.pagination.pages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleAdmin = async (user: AdminUser) => {
    try {
      await api.updateAdminUser(user._id, { isAdmin: !user.isAdmin });
      loadUsers(currentPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de mise à jour');
    }
  };

  const handleDeleteUser = async (user: AdminUser) => {
    if (!confirm(`Supprimer l'utilisateur ${user.displayName} ? Cette action est irréversible.`)) {
      return;
    }
    try {
      await api.deleteAdminUser(user._id);
      loadUsers(currentPage);
      loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de suppression');
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="admin-panel" onClick={(e) => e.stopPropagation()}>
        <div className="admin-header">
          <h2>Administration</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="admin-tabs">
          <button
            className={`admin-tab ${activeTab === 'stats' ? 'active' : ''}`}
            onClick={() => setActiveTab('stats')}
          >
            Statistiques
          </button>
          <button
            className={`admin-tab ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            Utilisateurs
          </button>
        </div>

        {error && <div className="auth-error">{error}</div>}

        {isLoading ? (
          <div className="admin-loading">Chargement...</div>
        ) : activeTab === 'stats' ? (
          <div className="admin-stats">
            <div className="stats-grid">
              <div className="stat-card">
                <span className="stat-value">{stats?.totalUsers || 0}</span>
                <span className="stat-label">Utilisateurs</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{stats?.onlineUsers || 0}</span>
                <span className="stat-label">En ligne</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{stats?.totalContacts || 0}</span>
                <span className="stat-label">Contacts</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{stats?.totalMessages || 0}</span>
                <span className="stat-label">Messages</span>
              </div>
            </div>

            <div className="recent-users">
              <h3>Derniers inscrits</h3>
              {recentUsers.map((user) => (
                <div key={user._id} className="recent-user-item">
                  <span className={`status-dot ${user.isOnline ? 'online' : 'offline'}`} />
                  <span className="user-name">{user.displayName}</span>
                  <span className="user-username">@{user.username}</span>
                  <span className="user-date">{formatDate(user.createdAt)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="admin-users">
            <div className="users-list">
              {users.map((user) => (
                <div key={user._id} className="user-item">
                  <div className="user-info">
                    <span className={`status-dot ${user.isOnline ? 'online' : 'offline'}`} />
                    <div className="user-details">
                      <span className="user-name">
                        {user.displayName}
                        {user.isAdmin && <span className="admin-badge">Admin</span>}
                      </span>
                      <span className="user-meta">
                        @{user.username} • {user.email}
                      </span>
                      <span className="user-date">
                        Inscrit le {formatDate(user.createdAt)}
                      </span>
                    </div>
                  </div>
                  <div className="user-actions">
                    <button
                      className={`toggle-admin-btn ${user.isAdmin ? 'is-admin' : ''}`}
                      onClick={() => handleToggleAdmin(user)}
                      title={user.isAdmin ? 'Retirer admin' : 'Promouvoir admin'}
                    >
                      {user.isAdmin ? '👑' : '⭐'}
                    </button>
                    <button
                      className="delete-user-btn"
                      onClick={() => handleDeleteUser(user)}
                      title="Supprimer"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="pagination">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => p - 1)}
                >
                  ←
                </button>
                <span>{currentPage} / {totalPages}</span>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => p + 1)}
                >
                  →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
