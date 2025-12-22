import { useState, useEffect, useRef } from "react";
import Peer, { DataConnection } from "peerjs";
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
  sender: "me" | "them";
  timestamp: Date;
  status?: "sending" | "sent" | "delivered" | "failed";
}

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

function App() {
  const [peerId, setPeerId] = useState<string>("");
  const [remotePeerId, setRemotePeerId] = useState<string>("");
  const [connected, setConnected] = useState(false);
  const [skippedConnection, setSkippedConnection] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null);

  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isWindowFocusedRef = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);

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
    });

    peer.on("connection", (conn) => {
      connRef.current = conn;
      setupConnection(conn);
    });

    peer.on("error", (err) => {
      console.error("Peer error:", err);
    });

    return () => {
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

  const setupConnection = (conn: DataConnection) => {
    conn.on("open", () => {
      setConnected(true);
    });

    conn.on("data", (data) => {
      const parsed = typeof data === "string" ? { type: "message", text: data } : data as { type: string; id?: string; messageId?: string; text?: string; image?: string };

      if (parsed.type === "ping") {
        conn.send({ type: "pong" });
        return;
      }
      if (parsed.type === "pong") {
        return;
      }
      if (parsed.type === "ack" && parsed.messageId) {
        setMessages((prev) =>
          prev.map((m) => (m.id === parsed.messageId ? { ...m, status: "delivered" } : m))
        );
        return;
      }

      const messageId = parsed.id || crypto.randomUUID();
      const message: Message = {
        id: messageId,
        text: parsed.text,
        image: parsed.image,
        sender: "them",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, message]);
      playNotificationSound();

      // Show system notification if window is not focused
      if (!isWindowFocusedRef.current) {
        const notifBody = message.image ? "Image reçue" : (message.text && message.text.length > 100
          ? message.text.substring(0, 100) + "..."
          : message.text || "");
        sendNotification({
          title: "Nouveau message",
          body: notifBody,
        });
      }

      // Send ACK
      conn.send({ type: "ack", messageId });
    });

    conn.on("close", () => {
      setConnected(false);
      connRef.current = null;
    });

    conn.on("error", () => {
      setConnected(false);
      connRef.current = null;
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

  const connectToPeer = () => {
    if (!peerRef.current || !remotePeerId.trim()) return;

    const conn = peerRef.current.connect(remotePeerId.trim());
    connRef.current = conn;
    setupConnection(conn);
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

  const copyPeerId = () => {
    navigator.clipboard.writeText(peerId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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

          <div className="skip-section">
            <button className="skip-button" onClick={() => setSkippedConnection(true)}>
              Skip for now
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="chat-container">
      <header className="chat-header">
        <h2>{connected ? "Connected" : "Offline"}</h2>
        <span className={`status-dot ${connected ? "online" : "offline"}`} />
        {!connected && (
          <button className="connect-btn" onClick={() => setSkippedConnection(false)}>
            Connect
          </button>
        )}
      </header>

      <div className="messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.sender} ${msg.status === "failed" ? "failed" : ""}`}>
            <div className="bubble">
              {msg.image && <img src={msg.image} alt="Image" className="message-image" />}
              {msg.text && <span>{msg.text}</span>}
            </div>
            <span className="timestamp">
              {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              {msg.sender === "me" && msg.status === "sent" && " ✓"}
              {msg.sender === "me" && msg.status === "delivered" && " ✓✓"}
              {msg.sender === "me" && msg.status === "failed" && " ✗"}
            </span>
          </div>
        ))}
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
        <input
          ref={inputRef}
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          placeholder={pendingImage ? "Add a caption..." : "Type a message or paste an image..."}
          autoFocus
        />
        <button type="submit" disabled={!inputMessage.trim() && !pendingImage}>
          Send
        </button>
      </form>
    </main>
  );
}

export default App;
