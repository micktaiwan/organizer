import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { load } from '@tauri-apps/plugin-store';

// Check if running in Tauri environment
const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

interface MediaDevicePreferences {
  microphoneId: string | null;
  microphoneLabel: string | null;
  cameraId: string | null;
  cameraLabel: string | null;
}

interface MediaDevicesContextType {
  microphones: MediaDeviceInfo[];
  cameras: MediaDeviceInfo[];
  selectedMicrophoneId: string | null;
  selectedCameraId: string | null;
  selectMicrophone: (deviceId: string | null) => void;
  selectCamera: (deviceId: string | null) => void;
  refreshDevices: () => Promise<void>;
  permissionStatus: 'granted' | 'denied' | 'prompt' | 'unknown';
  requestPermission: () => Promise<boolean>;
}

const MediaDevicesContext = createContext<MediaDevicesContextType | null>(null);

export const useMediaDevices = () => {
  const context = useContext(MediaDevicesContext);
  if (!context) {
    throw new Error('useMediaDevices must be used within a MediaDevicesProvider');
  }
  return context;
};

interface MediaDevicesProviderProps {
  children: React.ReactNode;
}

export const MediaDevicesProvider: React.FC<MediaDevicesProviderProps> = ({ children }) => {
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState<string | null>(null);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<'granted' | 'denied' | 'prompt' | 'unknown'>('unknown');

  const prefsLoaded = useRef(false);
  const savedPrefsRef = useRef<MediaDevicePreferences | null>(null);

  // Load preferences from Tauri store on mount
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        if (isTauri()) {
          const store = await load('settings.json', { autoSave: false, defaults: {} });
          const prefs = await store.get<MediaDevicePreferences>('media_device_preferences');
          if (prefs) {
            savedPrefsRef.current = prefs;
            setSelectedMicrophoneId(prefs.microphoneId);
            setSelectedCameraId(prefs.cameraId);
          }
        }
        prefsLoaded.current = true;
      } catch (error) {
        console.error('[MediaDevices] Failed to load preferences:', error);
        prefsLoaded.current = true;
      }
    };
    loadPreferences();
  }, []);

  // Save preferences when selections change
  useEffect(() => {
    if (!prefsLoaded.current) return;
    if (!isTauri()) return;

    const savePreferences = async () => {
      try {
        const store = await load('settings.json', { autoSave: false, defaults: {} });

        // Get labels for fallback matching
        const micLabel = microphones.find(m => m.deviceId === selectedMicrophoneId)?.label || null;
        const camLabel = cameras.find(c => c.deviceId === selectedCameraId)?.label || null;

        const prefs: MediaDevicePreferences = {
          microphoneId: selectedMicrophoneId,
          microphoneLabel: micLabel,
          cameraId: selectedCameraId,
          cameraLabel: camLabel,
        };
        await store.set('media_device_preferences', prefs);
        await store.save();
      } catch (error) {
        console.error('[MediaDevices] Failed to save preferences:', error);
      }
    };
    savePreferences();
  }, [selectedMicrophoneId, selectedCameraId, microphones, cameras]);

  // Enumerate devices
  const refreshDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();

      const audioInputs = devices.filter(d => d.kind === 'audioinput');
      const videoInputs = devices.filter(d => d.kind === 'videoinput');

      setMicrophones(audioInputs);
      setCameras(videoInputs);

      // Check if we have labels (indicates permission granted)
      const hasLabels = devices.some(d => d.label);
      if (hasLabels) {
        setPermissionStatus('granted');
      }

      // Try to match saved preferences if device IDs changed
      if (savedPrefsRef.current) {
        const prefs = savedPrefsRef.current;

        // Match microphone
        if (prefs.microphoneId) {
          const exactMatch = audioInputs.find(m => m.deviceId === prefs.microphoneId);
          if (exactMatch) {
            setSelectedMicrophoneId(prefs.microphoneId);
          } else if (prefs.microphoneLabel) {
            // Fallback: match by label
            const labelMatch = audioInputs.find(m => m.label === prefs.microphoneLabel);
            if (labelMatch) {
              setSelectedMicrophoneId(labelMatch.deviceId);
            }
          }
        }

        // Match camera
        if (prefs.cameraId) {
          const exactMatch = videoInputs.find(c => c.deviceId === prefs.cameraId);
          if (exactMatch) {
            setSelectedCameraId(prefs.cameraId);
          } else if (prefs.cameraLabel) {
            // Fallback: match by label
            const labelMatch = videoInputs.find(c => c.label === prefs.cameraLabel);
            if (labelMatch) {
              setSelectedCameraId(labelMatch.deviceId);
            }
          }
        }
      }
    } catch (error) {
      console.error('[MediaDevices] Failed to enumerate devices:', error);
    }
  }, []);

  // Request permission (needed to get device labels)
  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      // Request both audio and video to get all labels
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      // Stop all tracks immediately - we just needed permission
      stream.getTracks().forEach(track => track.stop());
      setPermissionStatus('granted');
      // Refresh devices to get labels
      await refreshDevices();
      return true;
    } catch (error) {
      console.error('[MediaDevices] Permission denied:', error);
      setPermissionStatus('denied');
      return false;
    }
  }, [refreshDevices]);

  // Initial device enumeration
  useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  // Listen for device changes
  useEffect(() => {
    const handleDeviceChange = () => {
      console.log('[MediaDevices] Device change detected');
      refreshDevices();
    };

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [refreshDevices]);

  const selectMicrophone = useCallback((deviceId: string | null) => {
    setSelectedMicrophoneId(deviceId);
  }, []);

  const selectCamera = useCallback((deviceId: string | null) => {
    setSelectedCameraId(deviceId);
  }, []);

  return (
    <MediaDevicesContext.Provider
      value={{
        microphones,
        cameras,
        selectedMicrophoneId,
        selectedCameraId,
        selectMicrophone,
        selectCamera,
        refreshDevices,
        permissionStatus,
        requestPermission,
      }}
    >
      {children}
    </MediaDevicesContext.Provider>
  );
};
