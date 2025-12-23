import { useState, useEffect, useRef } from "react";
import Peer, { DataConnection } from "peerjs";
import { Message, PeerMessage } from "../types";
import { STORAGE_KEYS } from "../constants";
import { load } from "@tauri-apps/plugin-store";
import { playNotificationSound } from "../utils/audio";
import { sendNotification, isPermissionGranted, requestPermission } from "@tauri-apps/plugin-notification";
import { getCurrentWindow } from "@tauri-apps/api/window";

export const usePeer = (username: string) => {
  const [peer, setPeer] = useState<Peer | null>(null);
  const [peerId, setPeerId] = useState("");
  const [remotePeerId, setRemotePeerId] = useState("");
  const [connected, setConnected] = useState(false);
  const [remoteUsername, setRemoteUsername] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isRemoteTyping, setIsRemoteTyping] = useState(false);
  
  const connRef = useRef<DataConnection | null>(null);
  const isWindowFocusedRef = useRef(true);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef<number>(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);

  useEffect(() => {
    const setupListeners = async () => {
      const window = getCurrentWindow();
      await window.onFocusChanged(({ payload: focused }) => {
        isWindowFocusedRef.current = focused;
      });
    };
    setupListeners();

    const initPeer = async () => {
      console.log("Initializing PeerJS...");
      const newPeer = new Peer();
      
      newPeer.on("open", async (id) => {
        console.log("Peer opened with ID:", id);
        setPeerId(id);
        setPeer(newPeer);
        
        const store = await load("settings.json", { autoSave: true, defaults: {} });
        const lastPeer = await store.get<string>(STORAGE_KEYS.lastPeerId);
        if (lastPeer && !connRef.current) {
          console.log("Auto-connecting to last peer:", lastPeer);
          connectToPeer(newPeer, lastPeer);
        }
      });

      newPeer.on("connection", (conn) => {
        console.log("Incoming connection from:", conn.peer);
        connRef.current = conn;
        setupConnection(conn);
      });

      newPeer.on("error", (err) => {
        console.error("Peer error:", err);
      });

      newPeer.on("disconnected", () => {
        console.log("Peer disconnected, attempting to reconnect...");
        newPeer.reconnect();
      });
    };

    initPeer();

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      // peer will be destroyed by cleanup or by the state being cleared
    };
  }, []);

  const setupConnection = (conn: DataConnection, targetPeerId?: string) => {
    conn.on("open", async () => {
      console.log("Data connection opened with:", conn.peer);
      setConnected(true);
      reconnectAttemptsRef.current = 0;
      const peerToSave = targetPeerId || conn.peer;
      if (peerToSave) {
        const store = await load("settings.json", { autoSave: true, defaults: {} });
        await store.set(STORAGE_KEYS.lastPeerId, peerToSave);
        setRemotePeerId(peerToSave);
      }
      if (username) {
        conn.send({ type: "userinfo", username });
      }

      // Heartbeat
      const heartbeat = setInterval(() => {
        if (!conn.open) {
          clearInterval(heartbeat);
          setConnected(false);
          return;
        }
        try {
          conn.send({ type: "ping" });
        } catch {
          clearInterval(heartbeat);
          setConnected(false);
        }
      }, 3000);
    });

    conn.on("data", (data) => {
      const parsed = (typeof data === "string" ? { type: "message", text: data } : data) as PeerMessage;
      handlePeerMessage(parsed, conn);
    });

    conn.on("close", () => {
      console.log("Data connection closed");
      setConnected(false);
      setRemoteUsername("");
      connRef.current = null;
      scheduleReconnect();
    });

    conn.on("error", (err) => {
      console.error("Data connection error:", err);
      setConnected(false);
      connRef.current = null;
      scheduleReconnect();
    });
  };

  const handlePeerMessage = async (parsed: PeerMessage, conn: DataConnection) => {
    if (parsed.type === "ping") { conn.send({ type: "pong" }); return; }
    if (parsed.type === "pong") return;
    if (parsed.type === "userinfo" && parsed.username) { setRemoteUsername(parsed.username); return; }
    
    if (parsed.type === "typing") {
      setIsRemoteTyping(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => setIsRemoteTyping(false), 2000);
      return;
    }

    if (parsed.type === "ack" && parsed.messageId) {
      setMessages(prev => prev.map(m => m.id === parsed.messageId ? { ...m, status: "delivered" } : m));
      return;
    }

    if (parsed.type === "read" && parsed.messageId) {
      setMessages(prev => prev.map(m => m.id === parsed.messageId ? { ...m, status: "read", readAt: parsed.readAt ? new Date(parsed.readAt) : new Date() } : m));
      return;
    }

    if (["call-request", "call-accept", "call-reject", "call-end", "call-toggle-camera"].includes(parsed.type)) {
      console.log("Relaying call signaling message:", parsed.type);
      window.dispatchEvent(new CustomEvent("peer-call-event", { detail: parsed }));
      return;
    }

    setIsRemoteTyping(false);
    const messageId = parsed.id || crypto.randomUUID();
    const message: Message = {
      id: messageId,
      text: parsed.text,
      image: parsed.image,
      audio: parsed.audio,
      sender: "them",
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, message]);
    playNotificationSound();

    if (!isWindowFocusedRef.current) {
      const permissionGranted = await isPermissionGranted() || (await requestPermission() === "granted");
      if (permissionGranted) {
        sendNotification({
          title: "Nouveau message",
          body: message.audio ? "Message vocal" : message.image ? "Image" : message.text || "",
        });
      }
    }

    conn.send({ type: "ack", messageId });
    conn.send({ type: "read", messageId, readAt: new Date().toISOString() });
  };

  const scheduleReconnect = async () => {
    const store = await load("settings.json", { autoSave: true, defaults: {} });
    const lastPeer = await store.get<string>(STORAGE_KEYS.lastPeerId);
    if (!lastPeer || !peer) return;

    reconnectAttemptsRef.current += 1;
    const delay = Math.min(2000 * Math.pow(2, reconnectAttemptsRef.current - 1), 30000);

    console.log(`Scheduling reconnect in ${delay}ms...`);
    reconnectTimeoutRef.current = setTimeout(() => {
      if (!peer || connRef.current?.open) return;
      connectToPeer(peer, lastPeer);
    }, delay);
  };

  const connectToPeer = (peerInstance: Peer | null, targetId?: string) => {
    const p = peerInstance || peer;
    const idToConnect = targetId || remotePeerId;
    if (!p || !idToConnect) {
      console.error("Cannot connect: peer or targetId missing", { hasPeer: !!p, targetId });
      return;
    }
    console.log("Connecting to peer:", idToConnect);
    const conn = p.connect(idToConnect);
    connRef.current = conn;
    setupConnection(conn, idToConnect);
  };

  const sendMessage = (text?: string, image?: string, audio?: string) => {
    if (!connRef.current?.open) return;
    const messageId = crypto.randomUUID();
    const message: Message = {
      id: messageId,
      text,
      image,
      audio,
      sender: "me",
      timestamp: new Date(),
      status: "sending",
    };
    setMessages(prev => [...prev, message]);

    try {
      connRef.current.send({ type: "message", id: messageId, text, image, audio });
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, status: "sent" } : m));
    } catch (err) {
      console.error("Failed to send message:", err);
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, status: "failed" } : m));
    }
  };

  const sendTyping = () => {
    if (!connRef.current?.open) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < 500) return;
    lastTypingSentRef.current = now;
    connRef.current.send({ type: "typing" });
  };

  return {
    peer,
    peerId,
    remotePeerId,
    setRemotePeerId,
    connected,
    remoteUsername,
    messages,
    setMessages,
    isRemoteTyping,
    connectToPeer: (id?: string) => connectToPeer(peer, id),
    sendMessage,
    sendTyping,
    connRef
  };
};
