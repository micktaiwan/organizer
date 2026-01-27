import { useState } from 'react';
import { RotateCcw, Check, Mic, Video, RefreshCw, AlertCircle } from 'lucide-react';
import { useMediaDevices } from '../../contexts/MediaDevicesContext';
import './SettingsScreen.css';

const UI_POSITION_KEYS = [
  'organizer-error-indicator-badge-position',
  'organizer-error-indicator-position',
];

export function SettingsScreen() {
  const [resetConfirmed, setResetConfirmed] = useState(false);
  const [refreshConfirmed, setRefreshConfirmed] = useState(false);
  const {
    microphones,
    cameras,
    selectedMicrophoneId,
    selectedCameraId,
    selectMicrophone,
    selectCamera,
    refreshDevices,
    requestPermission,
  } = useMediaDevices();

  const handleResetPositions = () => {
    UI_POSITION_KEYS.forEach(key => {
      localStorage.removeItem(key);
    });
    // Notify components to reset their positions
    window.dispatchEvent(new Event('reset-ui-positions'));
    setResetConfirmed(true);
    setTimeout(() => setResetConfirmed(false), 2000);
  };

  const handleRefreshDevices = async () => {
    await refreshDevices();
    setRefreshConfirmed(true);
    setTimeout(() => setRefreshConfirmed(false), 2000);
  };

  const handleRequestPermission = async () => {
    await requestPermission();
  };

  // Check if we have labels (permission granted) - devices without labels show empty strings
  const hasLabels = microphones.some(m => m.label) || cameras.some(c => c.label);

  return (
    <div className="settings-screen">
      <div className="settings-header">
        <h2>Paramètres</h2>
      </div>

      <div className="settings-content">
        <section className="settings-section">
          <h3>Audio & Vidéo</h3>

          {!hasLabels && (microphones.length > 0 || cameras.length > 0) && (
            <div className="settings-permission-warning">
              <AlertCircle size={16} />
              <span>Autorisez l'accès au micro et à la caméra pour voir les noms des appareils</span>
              <button className="settings-btn-small" onClick={handleRequestPermission}>
                Autoriser
              </button>
            </div>
          )}

          <div className="settings-item">
            <div className="settings-item-info">
              <span className="settings-item-label">
                <Mic size={16} className="settings-item-icon" />
                Microphone
              </span>
              <span className="settings-item-description">Appareil utilisé pour les appels</span>
            </div>
            {microphones.length === 0 ? (
              <span className="settings-no-device">Aucun appareil détecté</span>
            ) : (
              <select
                className="settings-select"
                value={selectedMicrophoneId || ''}
                onChange={(e) => selectMicrophone(e.target.value || null)}
              >
                <option value="">Par défaut</option>
                {microphones.map((mic) => (
                  <option key={mic.deviceId} value={mic.deviceId}>
                    {mic.label || `Microphone ${mic.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="settings-item">
            <div className="settings-item-info">
              <span className="settings-item-label">
                <Video size={16} className="settings-item-icon" />
                Webcam
              </span>
              <span className="settings-item-description">Caméra utilisée pour les appels vidéo</span>
            </div>
            {cameras.length === 0 ? (
              <span className="settings-no-device">Aucun appareil détecté</span>
            ) : (
              <select
                className="settings-select"
                value={selectedCameraId || ''}
                onChange={(e) => selectCamera(e.target.value || null)}
              >
                <option value="">Par défaut</option>
                {cameras.map((cam) => (
                  <option key={cam.deviceId} value={cam.deviceId}>
                    {cam.label || `Caméra ${cam.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="settings-item">
            <div className="settings-item-info">
              <span className="settings-item-label">Actualiser la liste</span>
              <span className="settings-item-description">Rechercher de nouveaux périphériques</span>
            </div>
            <button
              className={`settings-btn ${refreshConfirmed ? 'confirmed' : ''}`}
              onClick={handleRefreshDevices}
              disabled={refreshConfirmed}
            >
              {refreshConfirmed ? (
                <>
                  <Check size={16} />
                  Actualisé
                </>
              ) : (
                <>
                  <RefreshCw size={16} />
                  Actualiser
                </>
              )}
            </button>
          </div>
        </section>

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
