import { useEffect, useRef } from 'react';
import { getCurrentWindow, LogicalPosition, LogicalSize, availableMonitors } from '@tauri-apps/api/window';

const STORAGE_KEY = 'organizer-window-state';
const SAVE_DEBOUNCE_MS = 500;

interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Hook to persist and restore window position and size.
 * Saves state to localStorage and restores on app launch.
 * Also ensures window is visible on an available monitor.
 */
export function useWindowState() {
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    const appWindow = getCurrentWindow();

    // Save current window state to localStorage
    const saveWindowState = async () => {
      try {
        const position = await appWindow.outerPosition();
        const size = await appWindow.outerSize();
        const scaleFactor = await appWindow.scaleFactor();

        // Convert physical to logical coordinates
        const state: WindowState = {
          x: Math.round(position.x / scaleFactor),
          y: Math.round(position.y / scaleFactor),
          width: Math.round(size.width / scaleFactor),
          height: Math.round(size.height / scaleFactor),
        };

        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        console.log('[WindowState] Saved:', state);
      } catch (err) {
        console.error('[WindowState] Failed to save:', err);
      }
    };

    // Debounced save to avoid excessive writes during resize/move
    const debouncedSave = () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(saveWindowState, SAVE_DEBOUNCE_MS);
    };

    // Check if position is visible on any available monitor
    const isPositionVisible = async (x: number, y: number, width: number, height: number): Promise<boolean> => {
      try {
        const monitors = await availableMonitors();
        console.log('[WindowState] Available monitors:', monitors.length);

        // Window center point
        const centerX = x + width / 2;
        const centerY = y + height / 2;

        // Check if center is within any monitor bounds
        for (const monitor of monitors) {
          const pos = monitor.position;
          const monitorSize = monitor.size;
          const scaleFactor = monitor.scaleFactor;

          // Convert to logical coordinates
          const monitorX = pos.x / scaleFactor;
          const monitorY = pos.y / scaleFactor;
          const monitorWidth = monitorSize.width / scaleFactor;
          const monitorHeight = monitorSize.height / scaleFactor;

          if (
            centerX >= monitorX &&
            centerX <= monitorX + monitorWidth &&
            centerY >= monitorY &&
            centerY <= monitorY + monitorHeight
          ) {
            return true;
          }
        }
        return false;
      } catch (err) {
        console.error('[WindowState] Failed to check monitors:', err);
        return true; // Assume visible if we can't check
      }
    };

    // Restore window state from localStorage
    const restoreWindowState = async () => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        console.log('[WindowState] Restoring from:', saved);
        if (!saved) return;

        const state: WindowState = JSON.parse(saved);

        // Validate saved state
        if (
          typeof state.x !== 'number' ||
          typeof state.y !== 'number' ||
          typeof state.width !== 'number' ||
          typeof state.height !== 'number' ||
          state.width < 200 ||
          state.height < 200
        ) {
          console.warn('[WindowState] Invalid saved state');
          return;
        }

        // Check if position is still visible (monitor might have been disconnected)
        const isVisible = await isPositionVisible(state.x, state.y, state.width, state.height);
        console.log('[WindowState] Position visible:', isVisible);

        if (isVisible) {
          await appWindow.setPosition(new LogicalPosition(state.x, state.y));
          console.log('[WindowState] Position restored');
        }

        // Always restore size
        await appWindow.setSize(new LogicalSize(state.width, state.height));
        console.log('[WindowState] Size restored');
      } catch (err) {
        console.error('[WindowState] Failed to restore:', err);
      }
    };

    // Restore state only once on mount
    if (!initializedRef.current) {
      initializedRef.current = true;
      restoreWindowState();
    }

    let unlistenMove: (() => void) | null = null;
    let unlistenResize: (() => void) | null = null;

    // Listen for window move and resize events
    const setupListeners = async () => {
      try {
        unlistenMove = await appWindow.onMoved(() => {
          console.log('[WindowState] Window moved');
          debouncedSave();
        });
        unlistenResize = await appWindow.onResized(() => {
          console.log('[WindowState] Window resized');
          debouncedSave();
        });
        console.log('[WindowState] Listeners attached');
      } catch (err) {
        console.error('[WindowState] Failed to setup listeners:', err);
      }
    };

    setupListeners();

    // Cleanup
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      unlistenMove?.();
      unlistenResize?.();
    };
  }, []);
}
