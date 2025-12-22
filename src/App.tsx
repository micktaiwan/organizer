import { useState, useEffect, useRef } from "react";
import Peer, { DataConnection } from "peerjs";
import "./App.css";

interface Message {
  id: string;
  text: string;
  sender: "me" | "them";
  timestamp: Date;
}

function App() {
  const [peerId, setPeerId] = useState<string>("");
  const [remotePeerId, setRemotePeerId] = useState<string>("");
  const [connected, setConnected] = useState(false);
  const [skippedConnection, setSkippedConnection] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");

  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  const setupConnection = (conn: DataConnection) => {
    conn.on("open", () => {
      setConnected(true);
    });

    conn.on("data", (data) => {
      const message: Message = {
        id: crypto.randomUUID(),
        text: data as string,
        sender: "them",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, message]);
    });

    conn.on("close", () => {
      setConnected(false);
      connRef.current = null;
    });
  };

  const connectToPeer = () => {
    if (!peerRef.current || !remotePeerId.trim()) return;

    const conn = peerRef.current.connect(remotePeerId.trim());
    connRef.current = conn;
    setupConnection(conn);
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!connRef.current || !inputMessage.trim()) return;

    connRef.current.send(inputMessage);

    const message: Message = {
      id: crypto.randomUUID(),
      text: inputMessage,
      sender: "me",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, message]);
    setInputMessage("");
  };

  const copyPeerId = () => {
    navigator.clipboard.writeText(peerId);
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
              <button onClick={copyPeerId} disabled={!peerId}>
                Copy
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
          <div key={msg.id} className={`message ${msg.sender}`}>
            <div className="bubble">{msg.text}</div>
            <span className="timestamp">
              {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form className="message-input" onSubmit={sendMessage}>
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          placeholder="Type a message..."
          autoFocus
        />
        <button type="submit" disabled={!inputMessage.trim()}>
          Send
        </button>
      </form>
    </main>
  );
}

export default App;
