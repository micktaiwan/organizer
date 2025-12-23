import { useState, useEffect, useRef } from "react";
import Peer, { DataConnection, MediaConnection } from "peerjs";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import "./App.css";

interface Message {
  id: string;
  text?: string;
  image?: string; // base64 data URL
  audio?: string; // base64 audio data URL for voice messages
  sender: "me" | "them";
  timestamp: Date;
  status?: "sending" | "sent" | "delivered" | "read" | "failed";
  readAt?: Date; // when message was read by recipient
  isSystemMessage?: boolean;
  systemMessageType?: "missed-call" | "rejected-call" | "ended-call";
}

interface Contact {
  id: string;
  name: string;
  peerId: string;
  createdAt: Date;
}

// Storage keys differ between dev and prod to avoid conflicts
const STORAGE_PREFIX = import.meta.env.DEV ? "dev_" : "";
const STORAGE_KEYS = {
  username: `${STORAGE_PREFIX}username`,
  lastPeerId: `${STORAGE_PREFIX}lastPeerId`,
  contacts: `${STORAGE_PREFIX}contacts`,
};

// Emoji conversion map
const EMOJI_MAP: Record<string, string> = {
  ':)': '😊',
  ':-)': '😊',
  ':(': '😢',
  ':-(': '😢',
  ':D': '😃',
  ':-D': '😃',
  ':P': '😛',
  ':-P': '😛',
  ':p': '😛',
  ';)': '😉',
  ';-)': '😉',
  '<3': '❤️',
  ':o': '😮',
  ':O': '😮',
  ':/': '😕',
  ':-/': '😕',
  'xD': '😆',
  'XD': '😆',
  ':*': '😘',
  ':-*': '😘',
  '>:(': '😠',
  ":'(": '😢',
  'B)': '😎',
  'B-)': '😎',
  'o:)': '😇',
  'O:)': '😇',
  ':3': '😺',
  '</3': '💔',
  '<33': '💕',
  ':+1:': '👍',
  ':-1:': '👎',
  ':ok:': '👌',
  ':wave:': '👋',
  ':clap:': '👏',
  ':fire:': '🔥',
  ':100:': '💯',
};

const convertEmojis = (text: string): string => {
  let result = text;
  // Sort by length descending to match longer patterns first (e.g., </3 before <3)
  const sortedKeys = Object.keys(EMOJI_MAP).sort((a, b) => b.length - a.length);
  for (const shortcut of sortedKeys) {
    const escapedShortcut = shortcut.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedShortcut, 'g');
    result = result.replace(regex, EMOJI_MAP[shortcut]);
  }
  return result;
};

const playNotificationSound = () => {
  const audioContext = new AudioContext();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
  oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);

  gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.2);
};

let ringtoneInterval: ReturnType<typeof setInterval> | null = null;

const playRingtone = () => {
  stopRingtone();
  const playTone = () => {
    const audioContext = new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
    oscillator.frequency.setValueAtTime(480, audioContext.currentTime + 0.15);
    oscillator.frequency.setValueAtTime(440, audioContext.currentTime + 0.3);
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.4);
  };
  playTone();
  ringtoneInterval = setInterval(playTone, 1500);
};

const stopRingtone = () => {
  if (ringtoneInterval) {
    clearInterval(ringtoneInterval);
    ringtoneInterval = null;
  }
};

function App() {
  const [username, setUsername] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEYS.username) || "";
  });
  const [remoteUsername, setRemoteUsername] = useState<string>("");
  const [peerId, setPeerId] = useState<string>("");
  const [remotePeerId, setRemotePeerId] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEYS.lastPeerId) || "";
  });
  const [connected, setConnected] = useState(false);
  const [skippedConnection, setSkippedConnection] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [isRemoteTyping, setIsRemoteTyping] = useState(false);
  const [usernameSet, setUsernameSet] = useState<boolean>(() => {
    return !!localStorage.getItem(STORAGE_KEYS.username);
  });

  // Contacts state
  const [contacts, setContacts] = useState<Contact[]>(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.contacts);
    if (stored) {
      try {
        return JSON.parse(stored).map((c: Contact) => ({
          ...c,
          createdAt: new Date(c.createdAt),
        }));
      } catch {
        return [];
      }
    }
    return [];
  });
  const [showContactsModal, setShowContactsModal] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [newContactName, setNewContactName] = useState("");
  const [newContactPeerId, setNewContactPeerId] = useState("");

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);

  // Call states
  const [callState, setCallState] = useState<'idle' | 'calling' | 'incoming' | 'connected'>('idle');
  const [isCameraEnabled, setIsCameraEnabled] = useState(false);
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [incomingCallWithCamera, setIncomingCallWithCamera] = useState(false);
  const [remoteHasCamera, setRemoteHasCamera] = useState(false);

  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isWindowFocusedRef = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef<number>(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);

  // Voice recording refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);

  // Call refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const mediaConnectionRef = useRef<MediaConnection | null>(null);
  const callHandlersRef = useRef<{
    onCallAccept: (withCamera: boolean) => void;
    onIncomingCall: (call: MediaConnection) => void;
  } | null>(null);

  useEffect(() => {
    const title = import.meta.env.DEV ? "Organizer - Dev mode" : "Organizer";
    getCurrentWindow().setTitle(title);
  }, []);

  useEffect(() => {
    const setupNotifications = async () => {
      let permissionGranted = await isPermissionGranted();
      if (!permissionGranted) {
        const permission = await requestPermission();
        permissionGranted = permission === "granted";
      }
    };
    setupNotifications();

    const window = getCurrentWindow();
    let unlistenFocus: (() => void) | undefined;
    let unlistenBlur: (() => void) | undefined;

    const setupListeners = async () => {
      unlistenFocus = await window.onFocusChanged(({ payload: focused }) => {
        isWindowFocusedRef.current = focused;
      });
    };
    setupListeners();

    return () => {
      unlistenFocus?.();
      unlistenBlur?.();
    };
  }, []);

  useEffect(() => {
    const peer = new Peer();
    peerRef.current = peer;

    peer.on("open", (id) => {
      setPeerId(id);
      // Auto-connect to last peer if available
      const lastPeer = localStorage.getItem(STORAGE_KEYS.lastPeerId);
      if (lastPeer && !connRef.current) {
        reconnectAttemptsRef.current = 0;
        const conn = peer.connect(lastPeer);
        connRef.current = conn;
        setupConnection(conn, lastPeer);
      }
    });

    peer.on("connection", (conn) => {
      connRef.current = conn;
      setupConnection(conn);
    });

    peer.on("call", (call) => {
      mediaConnectionRef.current = call;
      if (callHandlersRef.current) {
        callHandlersRef.current.onIncomingCall(call);
      }
    });

    peer.on("error", (err) => {
      console.error("Peer error:", err);
    });

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      peer.destroy();
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) continue;

          const reader = new FileReader();
          reader.onload = (event) => {
            const base64 = event.target?.result as string;
            setPendingImage(base64);
          };
          reader.readAsDataURL(file);
          break;
        }
      }
    };

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, []);

  const setupConnection = (conn: DataConnection, remotePeer?: string) => {
    conn.on("open", () => {
      setConnected(true);
      reconnectAttemptsRef.current = 0; // Reset on successful connection
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      // Save for auto-reconnect
      const peerToSave = remotePeer || conn.peer;
      if (peerToSave) {
        localStorage.setItem(STORAGE_KEYS.lastPeerId, peerToSave);
        setRemotePeerId(peerToSave);
      }
      // Send our username to the peer
      const storedUsername = localStorage.getItem(STORAGE_KEYS.username);
      if (storedUsername) {
        conn.send({ type: "userinfo", username: storedUsername });
      }
    });

    conn.on("data", (data) => {
      const parsed = typeof data === "string" ? { type: "message", text: data } : data as { type: string; id?: string; messageId?: string; text?: string; image?: string; audio?: string; username?: string; withCamera?: boolean; enabled?: boolean; readAt?: string };

      if (parsed.type === "ping") {
        conn.send({ type: "pong" });
        return;
      }
      if (parsed.type === "pong") {
        return;
      }
      if (parsed.type === "userinfo" && parsed.username) {
        setRemoteUsername(parsed.username);
        return;
      }
      if (parsed.type === "typing") {
        setIsRemoteTyping(true);
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
        typingTimeoutRef.current = setTimeout(() => {
          setIsRemoteTyping(false);
        }, 2000);
        return;
      }
      if (parsed.type === "ack" && parsed.messageId) {
        setMessages((prev) =>
          prev.map((m) => (m.id === parsed.messageId ? { ...m, status: "delivered" } : m))
        );
        return;
      }
      if (parsed.type === "read" && parsed.messageId) {
        console.log("📖 Read receipt received for message:", parsed.messageId);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === parsed.messageId
              ? { ...m, status: "read", readAt: parsed.readAt ? new Date(parsed.readAt) : new Date() }
              : m
          )
        );
        return;
      }

      // Call signaling
      if (parsed.type === "call-request") {
        setIncomingCallWithCamera(parsed.withCamera || false);
        setCallState('incoming');
        playRingtone();
        return;
      }
      if (parsed.type === "call-accept") {
        // Remote accepted, now initiate WebRTC call
        if (callHandlersRef.current) {
          callHandlersRef.current.onCallAccept(parsed.withCamera || false);
        }
        return;
      }
      if (parsed.type === "call-reject") {
        setCallState('idle');
        stopLocalStream();
        addCallSystemMessage("missed-call");
        return;
      }
      if (parsed.type === "call-end") {
        addCallSystemMessage("ended-call");
        endCallInternal();
        return;
      }
      if (parsed.type === "call-toggle-camera") {
        setRemoteHasCamera(parsed.enabled || false);
        return;
      }

      // Clear typing indicator when message received
      setIsRemoteTyping(false);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }

      const messageId = parsed.id || crypto.randomUUID();
      const message: Message = {
        id: messageId,
        text: parsed.text,
        image: parsed.image,
        audio: parsed.audio,
        sender: "them",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, message]);
      playNotificationSound();

      // Show system notification if window is not focused
      if (!isWindowFocusedRef.current) {
        const notifBody = message.audio
          ? "Message vocal reçu"
          : message.image
          ? "Image reçue"
          : message.text && message.text.length > 100
          ? message.text.substring(0, 100) + "..."
          : message.text || "";
        sendNotification({
          title: "Nouveau message",
          body: notifBody,
        });
      }

      // Send ACK
      conn.send({ type: "ack", messageId });

      // Send read receipt (always for now - TODO: only when window focused)
      console.log("📖 Sending read receipt for message:", messageId);
      conn.send({ type: "read", messageId, readAt: new Date().toISOString() });
    });

    const scheduleReconnect = () => {
      const lastPeer = localStorage.getItem(STORAGE_KEYS.lastPeerId);
      if (!lastPeer || !peerRef.current) return;

      reconnectAttemptsRef.current += 1;
      // Exponential backoff: 2s, 4s, 8s, 16s, max 30s
      const delay = Math.min(2000 * Math.pow(2, reconnectAttemptsRef.current - 1), 30000);

      reconnectTimeoutRef.current = setTimeout(() => {
        if (!peerRef.current || connRef.current?.open) return;

        console.log(`Reconnecting to ${lastPeer} (attempt ${reconnectAttemptsRef.current})...`);
        const newConn = peerRef.current.connect(lastPeer);
        connRef.current = newConn;
        setupConnection(newConn, lastPeer);
      }, delay);
    };

    conn.on("close", () => {
      setConnected(false);
      setRemoteUsername("");
      connRef.current = null;
      scheduleReconnect();
    });

    conn.on("error", () => {
      setConnected(false);
      setRemoteUsername("");
      connRef.current = null;
      scheduleReconnect();
    });

    // Heartbeat to detect disconnection
    const heartbeat = setInterval(() => {
      if (!conn.open) {
        clearInterval(heartbeat);
        setConnected(false);
        connRef.current = null;
        return;
      }
      try {
        conn.send({ type: "ping" });
      } catch {
        clearInterval(heartbeat);
        setConnected(false);
        connRef.current = null;
      }
    }, 3000);
  };

  const connectToPeer = (targetPeerId?: string) => {
    const peerIdToConnect = targetPeerId || remotePeerId.trim();
    if (!peerRef.current || !peerIdToConnect) return;

    const conn = peerRef.current.connect(peerIdToConnect);
    connRef.current = conn;
    setupConnection(conn, peerIdToConnect);
  };

  // === Call management functions ===

  const stopLocalStream = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
  };

  const endCallInternal = () => {
    stopRingtone();
    stopLocalStream();
    if (mediaConnectionRef.current) {
      mediaConnectionRef.current.close();
      mediaConnectionRef.current = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    setCallState('idle');
    setIsCameraEnabled(false);
    setIsMicEnabled(true);
    setRemoteHasCamera(false);
  };

  const setupMediaConnection = (call: MediaConnection) => {
    call.on("stream", (remoteStream) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
      setCallState('connected');
    });

    call.on("close", () => {
      endCallInternal();
    });

    call.on("error", () => {
      endCallInternal();
    });
  };

  // Update call handlers ref so callbacks can access current functions
  useEffect(() => {
    callHandlersRef.current = {
      onCallAccept: (withCamera: boolean) => {
        setRemoteHasCamera(withCamera);
        if (!peerRef.current || !localStreamRef.current) return;

        const call = peerRef.current.call(remotePeerId, localStreamRef.current);
        mediaConnectionRef.current = call;
        setupMediaConnection(call);
      },
      onIncomingCall: (call: MediaConnection) => {
        // If we already accepted (have local stream), answer immediately
        if (localStreamRef.current) {
          call.answer(localStreamRef.current);
          setupMediaConnection(call);
        }
      },
    };
  });

  const startCall = async (withCamera: boolean) => {
    if (!connRef.current?.open || !peerRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: withCamera,
      });
      localStreamRef.current = stream;
      setIsCameraEnabled(withCamera);

      if (localVideoRef.current && withCamera) {
        localVideoRef.current.srcObject = stream;
      }

      // Send call request via DataChannel and wait for accept
      connRef.current.send({ type: "call-request", withCamera });
      setCallState('calling');
      // peer.call() will be done when we receive call-accept
    } catch (err) {
      console.error("Failed to start call:", err);
      setCallState('idle');
    }
  };

  const acceptCall = async (withCamera: boolean) => {
    stopRingtone();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: withCamera,
      });
      localStreamRef.current = stream;
      setIsCameraEnabled(withCamera);

      if (localVideoRef.current && withCamera) {
        localVideoRef.current.srcObject = stream;
      }

      // Send accept to trigger caller's peer.call()
      if (connRef.current?.open) {
        connRef.current.send({ type: "call-accept", withCamera });
      }

      setCallState('connected');
      // The actual WebRTC answer will happen in peer.on("call")
    } catch (err) {
      console.error("Failed to accept call:", err);
      rejectCall();
    }
  };

  const addCallSystemMessage = (type: "missed-call" | "rejected-call" | "ended-call") => {
    const textMap = {
      "missed-call": "Appel manqué",
      "rejected-call": "Appel refusé",
      "ended-call": "Appel terminé",
    };
    const message: Message = {
      id: crypto.randomUUID(),
      text: textMap[type],
      sender: "me",
      timestamp: new Date(),
      isSystemMessage: true,
      systemMessageType: type,
    };
    setMessages((prev) => [...prev, message]);
  };

  const rejectCall = () => {
    stopRingtone();
    if (connRef.current?.open) {
      connRef.current.send({ type: "call-reject" });
    }
    addCallSystemMessage("rejected-call");
    setCallState('idle');
  };

  const endCall = () => {
    if (connRef.current?.open) {
      connRef.current.send({ type: "call-end" });
    }
    addCallSystemMessage("ended-call");
    endCallInternal();
  };

  const toggleMic = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicEnabled(audioTrack.enabled);
      }
    }
  };

  const toggleCamera = async () => {
    if (!localStreamRef.current) return;

    const videoTracks = localStreamRef.current.getVideoTracks();

    if (isCameraEnabled && videoTracks.length > 0) {
      // Disable camera
      videoTracks.forEach(track => track.stop());
      localStreamRef.current.getVideoTracks().forEach(track => {
        localStreamRef.current?.removeTrack(track);
      });
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
      setIsCameraEnabled(false);
      if (connRef.current?.open) {
        connRef.current.send({ type: "call-toggle-camera", enabled: false });
      }
    } else {
      // Enable camera
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const videoTrack = videoStream.getVideoTracks()[0];
        localStreamRef.current.addTrack(videoTrack);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current;
        }
        setIsCameraEnabled(true);
        if (connRef.current?.open) {
          connRef.current.send({ type: "call-toggle-camera", enabled: true });
        }
      } catch (err) {
        console.error("Failed to enable camera:", err);
      }
    }
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();

    const hasText = inputMessage.trim().length > 0;
    const hasImage = pendingImage !== null;

    if (!hasText && !hasImage) return;

    const messageId = crypto.randomUUID();
    const message: Message = {
      id: messageId,
      text: hasText ? inputMessage : undefined,
      image: hasImage ? pendingImage : undefined,
      sender: "me",
      timestamp: new Date(),
      status: connected ? "sending" : "failed",
    };
    setMessages((prev) => [...prev, message]);
    setInputMessage("");
    setPendingImage(null);

    if (!connRef.current || !connRef.current.open) {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, status: "failed" } : m))
      );
      return;
    }

    try {
      connRef.current.send({
        type: "message",
        id: messageId,
        text: hasText ? inputMessage : undefined,
        image: hasImage ? pendingImage : undefined,
      });
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, status: "sent" } : m))
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, status: "failed" } : m))
      );
    }
  };

  const cancelPendingImage = () => {
    setPendingImage(null);
  };

  const sendTypingSignal = () => {
    if (!connRef.current?.open) return;

    const now = Date.now();
    // Throttle: only send typing signal every 500ms
    if (now - lastTypingSentRef.current < 500) return;

    lastTypingSentRef.current = now;
    try {
      connRef.current.send({ type: "typing" });
    } catch {
      // Ignore errors
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const converted = convertEmojis(e.target.value);
    setInputMessage(converted);
    sendTypingSignal();
  };

  const copyPeerId = () => {
    navigator.clipboard.writeText(peerId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const saveUsername = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    localStorage.setItem(STORAGE_KEYS.username, username.trim());
    setUsernameSet(true);
    // Notify connected peer of username change
    if (connRef.current?.open) {
      connRef.current.send({ type: "userinfo", username: username.trim() });
    }
  };

  const changeUsername = () => {
    setUsernameSet(false);
  };

  // Contact management functions
  const saveContactsToStorage = (contactsList: Contact[]) => {
    localStorage.setItem(STORAGE_KEYS.contacts, JSON.stringify(contactsList));
  };

  const addContact = (name: string, peerId: string) => {
    const newContact: Contact = {
      id: crypto.randomUUID(),
      name: name.trim(),
      peerId: peerId.trim(),
      createdAt: new Date(),
    };
    const updated = [...contacts, newContact];
    setContacts(updated);
    saveContactsToStorage(updated);
    setNewContactName("");
    setNewContactPeerId("");
  };

  const updateContact = (id: string, name: string, peerId: string) => {
    const updated = contacts.map((c) =>
      c.id === id ? { ...c, name: name.trim(), peerId: peerId.trim() } : c
    );
    setContacts(updated);
    saveContactsToStorage(updated);
    setEditingContact(null);
  };

  const deleteContact = (id: string) => {
    const updated = contacts.filter((c) => c.id !== id);
    setContacts(updated);
    saveContactsToStorage(updated);
  };

  const connectToContact = (contact: Contact) => {
    connectToPeer(contact.peerId);
    setShowContactsModal(false);
  };

  const getContactName = (peerId: string): string | null => {
    const contact = contacts.find((c) => c.peerId === peerId);
    return contact?.name || null;
  };

  const isCurrentPeerSaved = (): boolean => {
    return contacts.some((c) => c.peerId === remotePeerId);
  };

  const saveCurrentPeerAsContact = () => {
    setNewContactPeerId(remotePeerId);
    setNewContactName(remoteUsername || "");
    setShowContactsModal(true);
  };

  // Voice recording functions
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const sendVoiceMessage = (base64Audio: string) => {
    if (!base64Audio) return;

    const messageId = crypto.randomUUID();
    const message: Message = {
      id: messageId,
      audio: base64Audio,
      sender: "me",
      timestamp: new Date(),
      status: connected ? "sending" : "failed",
    };

    setMessages((prev) => [...prev, message]);

    if (!connRef.current || !connRef.current.open) {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, status: "failed" } : m))
      );
      return;
    }

    try {
      connRef.current.send({
        type: "message",
        id: messageId,
        audio: base64Audio,
      });
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, status: "sent" } : m))
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, status: "failed" } : m))
      );
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStreamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });

      audioChunksRef.current = [];
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64Audio = reader.result as string;
            sendVoiceMessage(base64Audio);
          };
          reader.readAsDataURL(audioBlob);
        }

        // Clean up stream
        if (recordingStreamRef.current) {
          recordingStreamRef.current.getTracks().forEach((track) => track.stop());
          recordingStreamRef.current = null;
        }
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setRecordingDuration(0);

      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Failed to start recording:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
      setRecordingDuration(0);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      audioChunksRef.current = []; // Clear chunks to prevent sending
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
      setRecordingDuration(0);

      // Clean up stream
      if (recordingStreamRef.current) {
        recordingStreamRef.current.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
      }
    }
  };

  // Username screen
  if (!usernameSet) {
    return (
      <main className="container">
        <h1>Organizer Chat</h1>

        <div className="connection-box">
          <div className="username-section">
            <p>Choisis ton pseudo :</p>
            <form onSubmit={saveUsername}>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ton pseudo..."
                autoFocus
              />
              <button type="submit" disabled={!username.trim()}>
                Continuer
              </button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  if (!connected && !skippedConnection) {
    return (
      <main className="container">
        <h1>Organizer Chat</h1>

        <div className="connection-box">
          <div className="peer-id-section">
            <p>Your ID:</p>
            <div className="peer-id-display">
              <code>{peerId || "Connecting..."}</code>
              <button onClick={copyPeerId} disabled={!peerId} className={copied ? "copied" : ""}>
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          <div className="connect-section">
            <p>Connect to peer:</p>
            <form onSubmit={(e) => { e.preventDefault(); connectToPeer(); }}>
              <input
                type="text"
                value={remotePeerId}
                onChange={(e) => setRemotePeerId(e.target.value)}
                placeholder="Paste peer ID here..."
              />
              <button type="submit" disabled={!remotePeerId.trim()}>
                Connect
              </button>
            </form>
          </div>

          <div className="contacts-section">
            <div className="contacts-header">
              <p>Contacts sauvegardés :</p>
              <button
                className="add-contact-btn"
                onClick={() => {
                  setEditingContact(null);
                  setNewContactName("");
                  setNewContactPeerId("");
                  setShowContactsModal(true);
                }}
              >
                + Ajouter
              </button>
            </div>

            {contacts.length === 0 ? (
              <p className="no-contacts">Aucun contact sauvegardé</p>
            ) : (
              <div className="contacts-list">
                {contacts.map((contact) => (
                  <div key={contact.id} className="contact-item">
                    <div className="contact-info">
                      <span className="contact-name">{contact.name}</span>
                      <span className="contact-peer-id">{contact.peerId.slice(0, 12)}...</span>
                    </div>
                    <div className="contact-actions">
                      <button
                        className="connect-contact-btn"
                        onClick={() => connectToContact(contact)}
                      >
                        Connecter
                      </button>
                      <button
                        className="edit-contact-btn"
                        onClick={() => {
                          setEditingContact(contact);
                          setNewContactName(contact.name);
                          setNewContactPeerId(contact.peerId);
                          setShowContactsModal(true);
                        }}
                      >
                        Modifier
                      </button>
                      <button
                        className="delete-contact-btn"
                        onClick={() => deleteContact(contact.id)}
                      >
                        Suppr.
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="skip-section">
            <button className="skip-button" onClick={() => setSkippedConnection(true)}>
              Skip for now
            </button>
          </div>
        </div>

        {/* Contacts Modal */}
        {showContactsModal && (
          <div className="modal-overlay" onClick={() => setShowContactsModal(false)}>
            <div className="contact-modal" onClick={(e) => e.stopPropagation()}>
              <h3>{editingContact ? "Modifier le contact" : "Ajouter un contact"}</h3>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (editingContact) {
                    updateContact(editingContact.id, newContactName, newContactPeerId);
                  } else {
                    addContact(newContactName, newContactPeerId);
                  }
                  setShowContactsModal(false);
                }}
              >
                <input
                  type="text"
                  value={newContactName}
                  onChange={(e) => setNewContactName(e.target.value)}
                  placeholder="Nom du contact"
                  autoFocus
                />
                <input
                  type="text"
                  value={newContactPeerId}
                  onChange={(e) => setNewContactPeerId(e.target.value)}
                  placeholder="Peer ID"
                />
                <div className="modal-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setShowContactsModal(false);
                      setEditingContact(null);
                      setNewContactName("");
                      setNewContactPeerId("");
                    }}
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={!newContactName.trim() || !newContactPeerId.trim()}
                  >
                    {editingContact ? "Mettre à jour" : "Ajouter"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="chat-container">
      <header className="chat-header">
        <span className={`status-dot ${connected ? "online" : "offline"}`} />
        <h2>{connected ? (remoteUsername || getContactName(remotePeerId) || "Connecté") : "Hors ligne"}</h2>
        <div className="header-actions">
          {connected && callState === 'idle' && (
            <>
              <button className="call-btn" onClick={() => startCall(false)} title="Appel audio">
                📞
              </button>
              <button className="call-btn" onClick={() => startCall(true)} title="Appel vidéo">
                📹
              </button>
              {!isCurrentPeerSaved() && (
                <button className="save-contact-btn" onClick={saveCurrentPeerAsContact} title="Sauvegarder ce contact">
                  💾
                </button>
              )}
            </>
          )}
          {!connected && (
            <button className="connect-btn" onClick={() => setSkippedConnection(false)}>
              Connecter
            </button>
          )}
          <button className="settings-btn" onClick={changeUsername} title="Changer de pseudo">
            {username}
          </button>
        </div>
      </header>

      <div className="messages">
        {messages.map((msg) => (
          msg.isSystemMessage ? (
            <div key={msg.id} className="system-message">
              <span className={`system-message-icon ${msg.systemMessageType}`}>
                {msg.systemMessageType === "missed-call" && "📵"}
                {msg.systemMessageType === "rejected-call" && "📵"}
                {msg.systemMessageType === "ended-call" && "📞"}
              </span>
              <span className="system-message-text">{msg.text}</span>
              <span className="system-message-time">
                {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          ) : (
            <div key={msg.id} className={`message ${msg.sender} ${msg.status === "failed" ? "failed" : ""}`}>
              <div className="bubble">
                {msg.image && <img src={msg.image} alt="Image" className="message-image" />}
                {msg.audio && (
                  <div className="audio-message">
                    <audio controls src={msg.audio} className="audio-player" />
                  </div>
                )}
                {msg.text && <span>{msg.text}</span>}
              </div>
              <span className="timestamp">
                {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                {msg.sender === "me" && msg.status === "sending" && " ..."}
                {msg.sender === "me" && msg.status === "sent" && " ✓"}
                {msg.sender === "me" && msg.status === "delivered" && " ✓✓"}
                {msg.sender === "me" && msg.status === "read" && (
                  <span className="read-status">
                    {" ✓✓ Lu à "}{msg.readAt ? msg.readAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                  </span>
                )}
                {msg.sender === "me" && msg.status === "failed" && " ✗"}
              </span>
            </div>
          )
        ))}
        {isRemoteTyping && (
          <div className="typing-indicator">
            <span></span>
            <span></span>
            <span></span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {pendingImage && (
        <div className="pending-image-preview">
          <img src={pendingImage} alt="Preview" />
          <button type="button" onClick={cancelPendingImage} className="cancel-image">
            ×
          </button>
        </div>
      )}

      <form className="message-input" onSubmit={sendMessage}>
        {isRecording ? (
          <div className="recording-ui">
            <span className="recording-indicator">🔴</span>
            <span className="recording-duration">{formatDuration(recordingDuration)}</span>
            <button type="button" className="cancel-recording" onClick={cancelRecording}>
              ✕
            </button>
            <button type="button" className="stop-recording" onClick={stopRecording}>
              ✓ Envoyer
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              className="voice-btn"
              onClick={startRecording}
              disabled={!connected}
              title="Enregistrer un message vocal"
            >
              🎤
            </button>
            <input
              ref={inputRef}
              type="text"
              value={inputMessage}
              onChange={handleInputChange}
              placeholder={pendingImage ? "Ajouter une légende..." : "Tapez un message ou collez une image..."}
              autoFocus
            />
            <button type="submit" disabled={!inputMessage.trim() && !pendingImage}>
              Envoyer
            </button>
          </>
        )}
      </form>

      {/* Incoming call modal */}
      {callState === 'incoming' && (
        <div className="call-overlay incoming-call">
          <div className="incoming-call-modal">
            <div className="caller-info">
              <div className="caller-avatar">📞</div>
              <h3>Appel de {remoteUsername || "inconnu"}</h3>
              <p>{incomingCallWithCamera ? "Appel vidéo" : "Appel audio"}</p>
            </div>
            <div className="incoming-call-actions">
              <button className="reject-btn" onClick={rejectCall}>
                Refuser
              </button>
              <button className="accept-btn" onClick={() => acceptCall(false)}>
                Audio
              </button>
              <button className="accept-btn video" onClick={() => acceptCall(true)}>
                Vidéo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Calling overlay */}
      {callState === 'calling' && (
        <div className="call-overlay">
          <div className="calling-info">
            <div className="caller-avatar pulse">📞</div>
            <h3>Appel en cours...</h3>
            <p>{remoteUsername || "En attente de réponse"}</p>
            <button className="end-call-btn" onClick={endCall}>
              Raccrocher
            </button>
          </div>
        </div>
      )}

      {/* Connected call overlay */}
      {callState === 'connected' && (
        <div className="call-overlay connected">
          <div className="video-container">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className={`remote-video ${!remoteHasCamera ? 'audio-only' : ''}`}
            />
            {!remoteHasCamera && (
              <div className="audio-only-avatar">
                <span>🎧</span>
                <p>{remoteUsername || "Connecté"}</p>
              </div>
            )}
            {isCameraEnabled && (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="local-video"
              />
            )}
          </div>
          <div className="call-controls">
            <button
              className={`control-btn ${!isMicEnabled ? 'disabled' : ''}`}
              onClick={toggleMic}
              title={isMicEnabled ? "Couper le micro" : "Activer le micro"}
            >
              {isMicEnabled ? "🎤" : "🔇"}
            </button>
            <button
              className={`control-btn ${!isCameraEnabled ? 'disabled' : ''}`}
              onClick={toggleCamera}
              title={isCameraEnabled ? "Couper la caméra" : "Activer la caméra"}
            >
              {isCameraEnabled ? "📹" : "📷"}
            </button>
            <button className="end-call-btn" onClick={endCall}>
              Raccrocher
            </button>
          </div>
        </div>
      )}

      {/* Contacts Modal (for saving current peer) */}
      {showContactsModal && (
        <div className="modal-overlay" onClick={() => setShowContactsModal(false)}>
          <div className="contact-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editingContact ? "Modifier le contact" : "Ajouter un contact"}</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (editingContact) {
                  updateContact(editingContact.id, newContactName, newContactPeerId);
                } else {
                  addContact(newContactName, newContactPeerId);
                }
                setShowContactsModal(false);
              }}
            >
              <input
                type="text"
                value={newContactName}
                onChange={(e) => setNewContactName(e.target.value)}
                placeholder="Nom du contact"
                autoFocus
              />
              <input
                type="text"
                value={newContactPeerId}
                onChange={(e) => setNewContactPeerId(e.target.value)}
                placeholder="Peer ID"
              />
              <div className="modal-actions">
                <button
                  type="button"
                  onClick={() => {
                    setShowContactsModal(false);
                    setEditingContact(null);
                    setNewContactName("");
                    setNewContactPeerId("");
                  }}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={!newContactName.trim() || !newContactPeerId.trim()}
                >
                  {editingContact ? "Mettre à jour" : "Ajouter"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
