import { useState } from 'react';
import { AlertTriangle, X, Trash2 } from 'lucide-react';
import { useConsoleErrors, ConsoleError } from '../../hooks/useConsoleErrors';
import './ErrorIndicator.css';

function formatTime(date: Date): string {
  return date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function ErrorEntry({ error }: { error: ConsoleError }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`error-entry error-${error.level}`}
      onClick={() => error.stack && setExpanded(!expanded)}
    >
      <span className="error-time">{formatTime(error.timestamp)}</span>
      <span className={`error-level error-level-${error.level}`}>
        {error.level === 'error' ? 'ERR' : 'WARN'}
      </span>
      <span className="error-message">{error.message}</span>
      {expanded && error.stack && (
        <pre className="error-stack">{error.stack}</pre>
      )}
    </div>
  );
}

export function ErrorIndicator() {
  const { errors, errorCount, warnCount, totalCount, clearErrors } = useConsoleErrors();
  const [isOpen, setIsOpen] = useState(false);

  if (totalCount === 0 && !isOpen) {
    return null;
  }

  const badgeClass = errorCount > 0 ? 'has-errors' : 'has-warnings';

  return (
    <>
      {/* Badge */}
      <button
        className={`error-indicator-badge ${badgeClass}`}
        onClick={() => setIsOpen(!isOpen)}
        title={`${errorCount} errors, ${warnCount} warnings`}
      >
        <AlertTriangle size={14} />
        <span className="error-count">{totalCount}</span>
      </button>

      {/* Panel */}
      {isOpen && (
        <div className="error-indicator-panel">
          <div className="error-panel-header">
            <div className="error-panel-title">
              <AlertTriangle size={16} />
              <span>Console Errors</span>
              <span className="error-panel-counts">
                {errorCount > 0 && (
                  <span className="count-error">{errorCount} err</span>
                )}
                {warnCount > 0 && (
                  <span className="count-warn">{warnCount} warn</span>
                )}
              </span>
            </div>
            <div className="error-panel-actions">
              <button
                onClick={clearErrors}
                title="Clear all"
                className="error-panel-btn"
              >
                <Trash2 size={14} />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                title="Close"
                className="error-panel-btn"
              >
                <X size={14} />
              </button>
            </div>
          </div>
          <div className="error-panel-content">
            {errors.length === 0 ? (
              <div className="error-panel-empty">No errors</div>
            ) : (
              errors.map((error) => (
                <ErrorEntry key={error.id} error={error} />
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}
