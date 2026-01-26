import { useState, useEffect, useRef } from "react";
import { load } from "@tauri-apps/plugin-store";

// Check if running in Tauri environment
const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function useDebugPreferences() {
  // Dev tools state
  const [showLogPanel, setShowLogPanel] = useState(false);
  const [debugUseLocalServer, setDebugUseLocalServer] = useState(false);
  const [debugViewMode, setDebugViewMode] = useState<'chat' | 'brain'>('chat');

  // Track if preferences have been loaded to avoid overwriting on mount
  const debugPrefsLoaded = useRef(false);

  // Load debug preferences on mount
  useEffect(() => {
    const loadDebugPreferences = async () => {
      try {
        if (isTauri()) {
          const store = await load('pet-debug.json', { autoSave: false, defaults: {} });
          const savedServer = await store.get<boolean>('pet_debug_use_local');
          if (savedServer !== null && savedServer !== undefined) {
            setDebugUseLocalServer(savedServer);
          }
          const savedViewMode = await store.get<'chat' | 'brain'>('viewMode');
          if (savedViewMode !== null && savedViewMode !== undefined) {
            setDebugViewMode(savedViewMode);
          }
          const savedShowLogPanel = await store.get<boolean>('showLogPanel');
          if (savedShowLogPanel !== null && savedShowLogPanel !== undefined) {
            setShowLogPanel(savedShowLogPanel);
          }
        }
        debugPrefsLoaded.current = true;
      } catch (error) {
        console.error('[App] Failed to load debug preferences:', error);
        debugPrefsLoaded.current = true;
      }
    };
    loadDebugPreferences();
  }, []);

  // Save showLogPanel when it changes (but not on initial mount)
  useEffect(() => {
    if (!debugPrefsLoaded.current) return;
    if (!isTauri()) return;
    const saveShowLogPanel = async () => {
      try {
        const store = await load('pet-debug.json', { autoSave: false, defaults: {} });
        await store.set('showLogPanel', showLogPanel);
        await store.save();
      } catch (error) {
        console.error('[App] Failed to save showLogPanel:', error);
      }
    };
    saveShowLogPanel();
  }, [showLogPanel]);

  return {
    showLogPanel,
    setShowLogPanel,
    debugUseLocalServer,
    setDebugUseLocalServer,
    debugViewMode,
    setDebugViewMode,
  };
}
