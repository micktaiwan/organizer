import React, { useState } from 'react';
import { UserStatus } from '../../types';
import { api } from '../../services/api';
import './StatusSelector.css';

const EXPIRATION_OPTIONS = [
  { value: 0, label: "Pas d'expiration" },
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 heure' },
  { value: 240, label: '4 heures' },
  { value: -1, label: "Aujourd'hui" },
];

function calculateExpiresAt(minutes: number): string | null {
  if (minutes === 0) return null;
  if (minutes === -1) {
    // End of day (23:59:59)
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    return endOfDay.toISOString();
  }
  const date = new Date();
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
}

function getInitialExpiresIn(expiresAt: string | null | undefined): number {
  if (!expiresAt) return 0;
  const expiresDate = new Date(expiresAt);
  const now = new Date();
  if (expiresDate <= now) return 0;

  // Check if it's end of day (23:59:xx)
  if (expiresDate.getHours() === 23 && expiresDate.getMinutes() === 59) {
    return -1; // "Today" option
  }

  const diffMinutes = Math.round((expiresDate.getTime() - now.getTime()) / 60000);
  // Find closest option
  if (diffMinutes <= 35) return 30;
  if (diffMinutes <= 90) return 60;
  if (diffMinutes <= 300) return 240;
  return 0;
}

interface StatusSelectorProps {
  currentStatus: UserStatus;
  currentStatusMessage: string | null;
  currentIsMuted: boolean;
  currentStatusExpiresAt?: string | null;
  onStatusChange?: (status: UserStatus, statusMessage: string | null, isMuted: boolean) => void;
}

export const StatusSelector: React.FC<StatusSelectorProps> = ({
  currentStatus,
  currentStatusMessage,
  currentIsMuted,
  currentStatusExpiresAt,
  onStatusChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<UserStatus>(currentStatus);
  const [statusMessage, setStatusMessage] = useState(currentStatusMessage || '');
  const [isMuted, setIsMuted] = useState(currentIsMuted);
  const [expiresIn, setExpiresIn] = useState(() => getInitialExpiresIn(currentStatusExpiresAt));

  const statuses: { value: UserStatus; label: string; emoji: string; color: string }[] = [
    { value: 'available', label: 'Disponible', emoji: '🟢', color: '#34c759' },
    { value: 'busy', label: 'Occupé', emoji: '🟠', color: '#ff9500' },
    { value: 'away', label: 'Absent', emoji: '🔴', color: '#ff3b30' },
    { value: 'dnd', label: 'Ne pas déranger', emoji: '⛔', color: '#8e8e93' },
  ];

  const currentStatusInfo = statuses.find(s => s.value === status);

  const handleSave = async () => {
    try {
      const expiresAt = calculateExpiresAt(expiresIn);
      await api.updateStatus(status, statusMessage || null, isMuted, expiresAt);
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

          <div className="status-expiration">
            <label>Expiration du statut</label>
            <select
              value={expiresIn}
              onChange={(e) => setExpiresIn(Number(e.target.value))}
            >
              {EXPIRATION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

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
