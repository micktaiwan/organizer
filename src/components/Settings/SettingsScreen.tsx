import { useState } from 'react';
import { RotateCcw, Check } from 'lucide-react';
import './SettingsScreen.css';

const UI_POSITION_KEYS = [
  'organizer-error-indicator-badge-position',
  'organizer-error-indicator-position',
];

export function SettingsScreen() {
  const [resetConfirmed, setResetConfirmed] = useState(false);

  const handleResetPositions = () => {
    UI_POSITION_KEYS.forEach(key => {
      localStorage.removeItem(key);
    });
    // Notify components to reset their positions
    window.dispatchEvent(new Event('reset-ui-positions'));
    setResetConfirmed(true);
    setTimeout(() => setResetConfirmed(false), 2000);
  };

  return (
    <div className="settings-screen">
      <div className="settings-header">
        <h2>Paramètres</h2>
      </div>

      <div className="settings-content">
        <section className="settings-section">
          <h3>Interface</h3>

          <div className="settings-item">
            <div className="settings-item-info">
              <span className="settings-item-label">Positions des éléments</span>
              <span className="settings-item-description">
                Réinitialise la position des indicateurs d'erreur et autres éléments déplaçables
              </span>
            </div>
            <button
              className={`settings-btn ${resetConfirmed ? 'confirmed' : ''}`}
              onClick={handleResetPositions}
              disabled={resetConfirmed}
            >
              {resetConfirmed ? (
                <>
                  <Check size={16} />
                  Réinitialisé
                </>
              ) : (
                <>
                  <RotateCcw size={16} />
                  Réinitialiser
                </>
              )}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
