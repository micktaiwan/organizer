import React, { useState } from 'react';
import { UserStatus } from '../../types';
import { api } from '../../services/api';
import './StatusSelector.css';

interface StatusSelectorProps {
  currentStatus: UserStatus;
  currentStatusMessage: string | null;
  currentIsMuted: boolean;
  onStatusChange?: (status: UserStatus, statusMessage: string | null, isMuted: boolean) => void;
}

export const StatusSelector: React.FC<StatusSelectorProps> = ({
  currentStatus,
  currentStatusMessage,
  currentIsMuted,
  onStatusChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<UserStatus>(currentStatus);
  const [statusMessage, setStatusMessage] = useState(currentStatusMessage || '');
  const [isMuted, setIsMuted] = useState(currentIsMuted);

  const statuses: { value: UserStatus; label: string; emoji: string; color: string }[] = [
    { value: 'available', label: 'Disponible', emoji: '🟢', color: '#34c759' },
    { value: 'busy', label: 'Occupé', emoji: '🟠', color: '#ff9500' },
    { value: 'away', label: 'Absent', emoji: '🔴', color: '#ff3b30' },
    { value: 'dnd', label: 'Ne pas déranger', emoji: '⛔', color: '#8e8e93' },
  ];

  const currentStatusInfo = statuses.find(s => s.value === status);

  const handleSave = async () => {
    try {
      await api.updateStatus(status, statusMessage || null, isMuted);
      onStatusChange?.(status, statusMessage || null, isMuted);
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  return (
    <div className="status-selector">
      <button
        className="status-selector-trigger"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span
          className="status-dot"
          style={{ backgroundColor: currentStatusInfo?.color }}
        />
        <span className="status-label">{currentStatusInfo?.label}</span>
        {currentStatusMessage && <span className="status-message">"{currentStatusMessage}"</span>}
      </button>

      {isOpen && (
        <div className="status-selector-dropdown">
          <div className="status-options">
            {statuses.map((s) => (
              <button
                key={s.value}
                className={`status-option ${status === s.value ? 'active' : ''}`}
                onClick={() => setStatus(s.value)}
              >
                <span style={{ color: s.color }}>{s.emoji}</span>
                <span>{s.label}</span>
              </button>
            ))}
          </div>

          <div className="status-message-input">
            <input
              type="text"
              placeholder="Message de statut (optionnel)"
              value={statusMessage}
              onChange={(e) => setStatusMessage(e.target.value)}
              maxLength={100}
            />
          </div>

          <label className="status-mute-toggle">
            <input
              type="checkbox"
              checked={isMuted}
              onChange={(e) => setIsMuted(e.target.checked)}
            />
            <span>Mode silencieux (pas de notifications)</span>
          </label>

          <div className="status-actions">
            <button className="btn btn-secondary" onClick={() => setIsOpen(false)}>
              Annuler
            </button>
            <button className="btn btn-primary" onClick={handleSave}>
              Enregistrer
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
