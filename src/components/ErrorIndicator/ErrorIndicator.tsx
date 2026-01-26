import { useState, useEffect, useRef, useCallback } from 'react';
import { AlertTriangle, X, Trash2 } from 'lucide-react';
import { useConsoleErrors, ConsoleError } from '../../hooks/useConsoleErrors';
import './ErrorIndicator.css';

const PANEL_POSITION_KEY = 'organizer-error-indicator-position';
const BADGE_POSITION_KEY = 'organizer-error-indicator-badge-position';
const DEFAULT_PANEL_POSITION = { x: 10, y: -1 }; // -1 means use bottom positioning
const DEFAULT_BADGE_POSITION = { x: 10, y: -1 }; // -1 means use bottom positioning

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

function loadPosition(key: string, defaultPos: { x: number; y: number }): { x: number; y: number } {
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parse errors
  }
  return defaultPos;
}

function savePosition(key: string, position: { x: number; y: number }) {
  localStorage.setItem(key, JSON.stringify(position));
}

export function ErrorIndicator() {
  const { errors, errorCount, warnCount, totalCount, clearErrors } = useConsoleErrors();
  const [isOpen, setIsOpen] = useState(false);

  // Badge position state
  const [badgePosition, setBadgePosition] = useState(() =>
    loadPosition(BADGE_POSITION_KEY, DEFAULT_BADGE_POSITION)
  );
  const [isBadgeDragging, setIsBadgeDragging] = useState(false);
  const badgeDragOffset = useRef({ x: 0, y: 0 });
  const badgeRef = useRef<HTMLButtonElement>(null);

  // Panel position state
  const [panelPosition, setPanelPosition] = useState(() =>
    loadPosition(PANEL_POSITION_KEY, DEFAULT_PANEL_POSITION)
  );
  const [isPanelDragging, setIsPanelDragging] = useState(false);
  const panelDragOffset = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  // Track if badge was actually dragged (moved)
  const badgeDidMoveRef = useRef(false);
  const badgeStartPos = useRef({ x: 0, y: 0 });

  // Badge drag handlers
  const handleBadgeMouseDown = useCallback((e: React.MouseEvent) => {
    if (!badgeRef.current) return;
    const rect = badgeRef.current.getBoundingClientRect();
    badgeDragOffset.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    badgeStartPos.current = { x: e.clientX, y: e.clientY };
    badgeDidMoveRef.current = false;
    setIsBadgeDragging(true);
    e.preventDefault();
  }, []);

  const handleBadgeMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isBadgeDragging) return;
      // Check if moved more than 3px (threshold to distinguish click from drag)
      const dx = e.clientX - badgeStartPos.current.x;
      const dy = e.clientY - badgeStartPos.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        badgeDidMoveRef.current = true;
      }
      const newX = e.clientX - badgeDragOffset.current.x;
      const newY = e.clientY - badgeDragOffset.current.y;
      setBadgePosition({ x: newX, y: newY });
    },
    [isBadgeDragging]
  );

  const handleBadgeMouseUp = useCallback(() => {
    if (isBadgeDragging) {
      setIsBadgeDragging(false);
      if (badgeDidMoveRef.current) {
        setBadgePosition((pos) => {
          savePosition(BADGE_POSITION_KEY, pos);
          return pos;
        });
      }
    }
  }, [isBadgeDragging]);

  // Panel drag handlers
  const handlePanelMouseDown = useCallback((e: React.MouseEvent) => {
    if (!panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    panelDragOffset.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    setIsPanelDragging(true);
  }, []);

  const handlePanelMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isPanelDragging) return;
      const newX = e.clientX - panelDragOffset.current.x;
      const newY = e.clientY - panelDragOffset.current.y;
      setPanelPosition({ x: newX, y: newY });
    },
    [isPanelDragging]
  );

  const handlePanelMouseUp = useCallback(() => {
    if (isPanelDragging) {
      setIsPanelDragging(false);
      setPanelPosition((pos) => {
        savePosition(PANEL_POSITION_KEY, pos);
        return pos;
      });
    }
  }, [isPanelDragging]);

  // Badge drag effect
  useEffect(() => {
    if (isBadgeDragging) {
      document.addEventListener('mousemove', handleBadgeMouseMove);
      document.addEventListener('mouseup', handleBadgeMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleBadgeMouseMove);
        document.removeEventListener('mouseup', handleBadgeMouseUp);
      };
    }
  }, [isBadgeDragging, handleBadgeMouseMove, handleBadgeMouseUp]);

  // Panel drag effect
  useEffect(() => {
    if (isPanelDragging) {
      document.addEventListener('mousemove', handlePanelMouseMove);
      document.addEventListener('mouseup', handlePanelMouseUp);
      return () => {
        document.removeEventListener('mousemove', handlePanelMouseMove);
        document.removeEventListener('mouseup', handlePanelMouseUp);
      };
    }
  }, [isPanelDragging, handlePanelMouseMove, handlePanelMouseUp]);

  // Listen for reset event from Settings
  useEffect(() => {
    const handleReset = () => {
      setBadgePosition(DEFAULT_BADGE_POSITION);
      setPanelPosition(DEFAULT_PANEL_POSITION);
    };
    window.addEventListener('reset-ui-positions', handleReset);
    return () => window.removeEventListener('reset-ui-positions', handleReset);
  }, []);

  if (totalCount === 0 && !isOpen) {
    return null;
  }

  const badgeClass = errorCount > 0 ? 'has-errors' : 'has-warnings';

  // Badge style: use top/left if position.y >= 0, otherwise use bottom/left
  const badgeStyle: React.CSSProperties =
    badgePosition.y >= 0
      ? { left: badgePosition.x, top: badgePosition.y, bottom: 'auto' }
      : { left: badgePosition.x, bottom: 10 };

  // Panel style: use top/left if position.y >= 0, otherwise use bottom/left
  const panelStyle: React.CSSProperties =
    panelPosition.y >= 0
      ? { left: panelPosition.x, top: panelPosition.y }
      : { left: panelPosition.x, bottom: 50 };

  const handleBadgeClick = () => {
    // Only toggle if we didn't just finish dragging (moved more than 3px)
    if (badgeDidMoveRef.current) {
      return;
    }
    setIsOpen(!isOpen);
  };

  return (
    <>
      {/* Badge */}
      <button
        ref={badgeRef}
        className={`error-indicator-badge ${badgeClass} ${isBadgeDragging ? 'dragging' : ''}`}
        onMouseDown={handleBadgeMouseDown}
        onClick={handleBadgeClick}
        style={badgeStyle}
        title={`${errorCount} errors, ${warnCount} warnings`}
      >
        <AlertTriangle size={14} />
        <span className="error-count">{totalCount}</span>
      </button>

      {/* Panel */}
      {isOpen && (
        <div
          ref={panelRef}
          className="error-indicator-panel"
          style={panelStyle}
        >
          <div
            className={`error-panel-header ${isPanelDragging ? 'dragging' : ''}`}
            onMouseDown={handlePanelMouseDown}
          >
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
                onClick={() => {
                  clearErrors();
                  setIsOpen(false);
                }}
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
