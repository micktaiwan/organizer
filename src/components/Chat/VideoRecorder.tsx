import React, { useState } from "react";
import { Video, Monitor, Camera, X, Pause, Play, Square, Send, Trash2, RotateCcw, Check } from "lucide-react";
import { VideoSource, VideoRecorderState, VideoQuality, VIDEO_QUALITY_PRESETS } from "../../hooks/useVideoRecorder";
import { formatDuration } from "../../utils/audio";
import "./VideoRecorder.css";

interface VideoRecorderProps {
  state: VideoRecorderState;
  source: VideoSource | null;
  quality: VideoQuality;
  duration: number;
  previewUrl: string | null;
  error: string | null;
  onQualityChange: (quality: VideoQuality) => void;
  onSelectSource: (source: VideoSource) => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onSend: () => void;
  onDiscard: () => void;
  onRestart: () => void;
  onCancel: () => void;
}

// Source Selector Modal with Quality Options
export const SourceSelectorModal: React.FC<{
  quality: VideoQuality;
  onQualityChange: (quality: VideoQuality) => void;
  onSelect: (source: VideoSource) => void;
  onCancel: () => void;
  error: string | null;
}> = ({ quality, onQualityChange, onSelect, onCancel, error }) => {
  // Read last source directly from localStorage on mount
  const [selectedSource, setSelectedSource] = useState<VideoSource | null>(() => {
    const saved = localStorage.getItem('video-recorder-source');
    return (saved === 'screen' || saved === 'webcam') ? saved : null;
  });

  const handleStart = () => {
    if (selectedSource) {
      onSelect(selectedSource);
    }
  };

  return (
    <div className="video-modal-overlay" onClick={onCancel}>
      <div className="video-modal source-selector" onClick={e => e.stopPropagation()}>
        <h3>Enregistrer une vidéo</h3>

        {error && <div className="video-error">{error}</div>}

        <div className="source-section">
          <label className="section-label">Source</label>
          <div className="source-options">
            <button
              className={`source-option ${selectedSource === 'screen' ? 'selected' : ''}`}
              onClick={() => setSelectedSource('screen')}
            >
              <Monitor size={28} />
              <span>Écran</span>
              {selectedSource === 'screen' && <Check size={16} className="check-icon" />}
            </button>
            <button
              className={`source-option ${selectedSource === 'webcam' ? 'selected' : ''}`}
              onClick={() => setSelectedSource('webcam')}
            >
              <Camera size={28} />
              <span>Webcam</span>
              {selectedSource === 'webcam' && <Check size={16} className="check-icon" />}
            </button>
          </div>
        </div>

        <div className="quality-section">
          <label className="section-label">Qualité</label>
          <div className="quality-options">
            {(Object.keys(VIDEO_QUALITY_PRESETS) as VideoQuality[]).map((q) => (
              <button
                key={q}
                className={`quality-option ${quality === q ? 'selected' : ''}`}
                onClick={() => onQualityChange(q)}
              >
                <span className="quality-label">{VIDEO_QUALITY_PRESETS[q].label}</span>
                <span className="quality-desc">{VIDEO_QUALITY_PRESETS[q].description}</span>
                {quality === q && <Check size={14} className="check-icon" />}
              </button>
            ))}
          </div>
        </div>

        <div className="modal-actions">
          <button className="video-modal-cancel" onClick={onCancel}>
            Annuler
          </button>
          <button
            className="video-modal-start"
            onClick={handleStart}
            disabled={!selectedSource}
          >
            Démarrer
          </button>
        </div>
      </div>
    </div>
  );
};

// Recording UI (replaces message input during recording)
export const VideoRecordingUI: React.FC<{
  duration: number;
  isPaused: boolean;
  stream: MediaStream | null;
  source: VideoSource | null;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onCancel: () => void;
}> = ({ duration, isPaused, stream, source, onPause, onResume, onStop, onCancel }) => {
  const videoRef = React.useRef<HTMLVideoElement>(null);

  // Attach stream to video element for webcam preview
  React.useEffect(() => {
    if (videoRef.current && stream && source === 'webcam') {
      videoRef.current.srcObject = stream;
    }
  }, [stream, source]);

  return (
    <div className="video-recording-ui">
      {source === 'webcam' && stream && (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="webcam-preview"
        />
      )}
      <span className={`recording-indicator ${isPaused ? 'paused' : ''}`}>
        {isPaused ? '⏸️' : '🔴'}
      </span>
      <span className="recording-duration">{formatDuration(duration)}</span>

      {isPaused ? (
        <button type="button" className="video-btn-control resume" onClick={onResume} title="Reprendre">
          <Play size={18} />
        </button>
      ) : (
        <button type="button" className="video-btn-control pause" onClick={onPause} title="Pause">
          <Pause size={18} />
        </button>
      )}

      <button type="button" className="video-btn-control cancel" onClick={onCancel} title="Annuler">
        <X size={18} />
      </button>

      <button type="button" className="video-btn-control stop" onClick={onStop} title="Terminer">
        <Square size={18} />
        <span>Terminer</span>
      </button>
    </div>
  );
};

// Preview Modal
export const VideoPreviewModal: React.FC<{
  previewUrl: string;
  duration: number;
  isUploading: boolean;
  uploadProgress?: number;
  onSend: () => void;
  onDiscard: () => void;
  onRestart: () => void;
}> = ({ previewUrl, duration, isUploading, uploadProgress = 0, onSend, onDiscard, onRestart }) => {
  return (
    <div className="video-modal-overlay">
      <div className="video-modal preview-modal" onClick={e => e.stopPropagation()}>
        <div className="preview-video-container">
          <video
            src={previewUrl}
            controls
            autoPlay={false}
            className="preview-video"
          />
          <div className="preview-duration">{formatDuration(duration)}</div>
        </div>

        <div className="preview-actions">
          <button
            className="preview-btn send"
            onClick={onSend}
            disabled={isUploading}
          >
            {isUploading ? (
              <div className="upload-progress-container">
                <div className="upload-progress-bar" style={{ width: `${uploadProgress}%` }} />
                <span className="upload-progress-text">{uploadProgress}%</span>
              </div>
            ) : (
              <>
                <Send size={18} />
                <span>Envoyer</span>
              </>
            )}
          </button>

          <button
            className="preview-btn discard"
            onClick={onDiscard}
            disabled={isUploading}
          >
            <Trash2 size={18} />
            <span>Supprimer</span>
          </button>

          <button
            className="preview-btn restart"
            onClick={onRestart}
            disabled={isUploading}
          >
            <RotateCcw size={18} />
            <span>Refaire</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// Main VideoRecorder component (optional - for encapsulating all UI)
export const VideoRecorder: React.FC<VideoRecorderProps> = ({
  state,
  quality,
  duration,
  previewUrl,
  error,
  onQualityChange,
  onSelectSource,
  onPause: _onPause,
  onResume: _onResume,
  onStop: _onStop,
  onSend,
  onDiscard,
  onRestart,
  onCancel,
}) => {
  // Show source selector when idle and video recording initiated
  if (state === 'idle') {
    return (
      <SourceSelectorModal
        quality={quality}
        onQualityChange={onQualityChange}
        onSelect={onSelectSource}
        onCancel={onCancel}
        error={error}
      />
    );
  }

  // Show preview modal
  if (state === 'previewing' && previewUrl) {
    return (
      <VideoPreviewModal
        previewUrl={previewUrl}
        duration={duration}
        isUploading={false}
        onSend={onSend}
        onDiscard={onDiscard}
        onRestart={onRestart}
      />
    );
  }

  if (state === 'uploading' && previewUrl) {
    return (
      <VideoPreviewModal
        previewUrl={previewUrl}
        duration={duration}
        isUploading={true}
        onSend={onSend}
        onDiscard={onDiscard}
        onRestart={onRestart}
      />
    );
  }

  // Recording UI is rendered inline in MessageInput
  return null;
};

// Video button for MessageInput
export const VideoButton: React.FC<{
  onClick: () => void;
  disabled: boolean;
}> = ({ onClick, disabled }) => {
  return (
    <button
      type="button"
      className="video-btn"
      onClick={onClick}
      disabled={disabled}
      title="Enregistrer une vidéo"
    >
      <Video size={20} />
    </button>
  );
};
