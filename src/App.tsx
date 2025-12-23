import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { load } from "@tauri-apps/plugin-store";
import { STORAGE_KEYS } from "./constants";
import { usePeer } from "./hooks/usePeer";
import { useCall } from "./hooks/useCall";
import { useContacts } from "./hooks/useContacts";
import { useVoiceRecorder } from "./hooks/useVoiceRecorder";
import { convertEmojis } from "./utils/emojis";
import { Contact } from "./types";

// Components
import { UsernameScreen } from "./components/Connection/UsernameScreen";
import { ConnectionScreen } from "./components/Connection/ConnectionScreen";
import { ChatHeader } from "./components/Chat/ChatHeader";
import { MessageList } from "./components/Chat/MessageList";
import { MessageInput } from "./components/Chat/MessageInput";
import { CallOverlay } from "./components/Call/CallOverlay";
import { IncomingCallModal } from "./components/Call/IncomingCallModal";
import { ContactModal } from "./components/Contact/ContactModal";

import "./App.css";

function App() {
  const [username, setUsername] = useState("");
  const [usernameSet, setUsernameSet] = useState(false);
  const [skippedConnection, setSkippedConnection] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inputMessage, setInputMessage] = useState("");
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  
  // Modals state
  const [showContactsModal, setShowContactsModal] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [newContactInitialName, setNewContactInitialName] = useState("");
  const [newContactInitialPeerId, setNewContactInitialPeerId] = useState("");

  const {
    peerId,
    remotePeerId,
    setRemotePeerId,
    connected,
    remoteUsername,
    messages,
    setMessages,
    isRemoteTyping,
    connectToPeer,
    sendMessage,
    sendTyping,
    peerRef,
    connRef
  } = usePeer(username);

  const addCallSystemMessage = (type: "missed-call" | "rejected-call" | "ended-call") => {
    const textMap = {
      "missed-call": "Appel manqué",
      "rejected-call": "Appel refusé",
      "ended-call": "Appel terminé",
    };
    setMessages((prev) => [...prev, {
      id: crypto.randomUUID(),
      text: textMap[type],
      sender: "me",
      timestamp: new Date(),
      isSystemMessage: true,
      systemMessageType: type,
    }]);
  };

  const {
    callState,
    isCameraEnabled,
    isMicEnabled,
    incomingCallWithCamera,
    remoteHasCamera,
    localVideoRef,
    remoteVideoRef,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMic,
    toggleCamera
  } = useCall(peerRef, connRef, remotePeerId, addCallSystemMessage);

  const {
    contacts,
    addContact,
    updateContact,
    deleteContact,
    isPeerSaved,
    getContactName
  } = useContacts();

  const {
    isRecording,
    recordingDuration,
    startRecording,
    stopRecording,
    cancelRecording
  } = useVoiceRecorder((base64) => sendMessage(undefined, undefined, base64));

  useEffect(() => {
    const title = import.meta.env.DEV ? "Organizer - Dev mode" : "Organizer";
    getCurrentWindow().setTitle(title);

    const loadUsername = async () => {
      const store = await load("settings.json", { autoSave: true, defaults: {} });
      const saved = await store.get<string>(STORAGE_KEYS.username);
      if (saved) {
        setUsername(saved);
        setUsernameSet(true);
      }
    };
    loadUsername();
  }, []);

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
          reader.onload = (event) => setPendingImage(event.target?.result as string);
          reader.readAsDataURL(file);
          break;
        }
      }
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, []);

  const handleSaveUsername = async (newUsername: string) => {
    const store = await load("settings.json", { autoSave: true, defaults: {} });
    await store.set(STORAGE_KEYS.username, newUsername);
    setUsername(newUsername);
    setUsernameSet(true);
    if (connRef.current?.open) {
      connRef.current.send({ type: "userinfo", username: newUsername });
    }
  };

  const handleCopyPeerId = () => {
    navigator.clipboard.writeText(peerId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() && !pendingImage) return;
    sendMessage(inputMessage || undefined, pendingImage || undefined);
    setInputMessage("");
    setPendingImage(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const converted = convertEmojis(e.target.value);
    setInputMessage(converted);
    sendTyping();
  };

  if (!usernameSet) {
    return <UsernameScreen initialUsername={username} onSave={handleSaveUsername} />;
  }

  if (!connected && !skippedConnection) {
    return (
      <>
        <ConnectionScreen
          peerId={peerId}
          remotePeerId={remotePeerId}
          setRemotePeerId={setRemotePeerId}
          onConnect={connectToPeer}
          onCopyPeerId={handleCopyPeerId}
          copied={copied}
          contacts={contacts}
          onAddContact={() => {
            setEditingContact(null);
            setNewContactInitialName("");
            setNewContactInitialPeerId("");
            setShowContactsModal(true);
          }}
          onEditContact={(c) => {
            setEditingContact(c);
            setShowContactsModal(true);
          }}
          onDeleteContact={deleteContact}
          onSkip={() => setSkippedConnection(true)}
        />
        {showContactsModal && (
          <ContactModal
            editingContact={editingContact}
            initialName={newContactInitialName}
            initialPeerId={newContactInitialPeerId}
            onSave={(name, pid) => {
              if (editingContact) updateContact(editingContact.id, name, pid);
              else addContact(name, pid);
              setShowContactsModal(false);
            }}
            onCancel={() => setShowContactsModal(false)}
          />
        )}
      </>
    );
  }

  return (
    <main className="chat-container">
      <ChatHeader
        connected={connected}
        remoteUsername={remoteUsername || getContactName(remotePeerId) || ""}
        callState={callState}
        onStartCall={startCall}
        isSaved={isPeerSaved(remotePeerId)}
        onSaveContact={() => {
          setNewContactInitialName(remoteUsername);
          setNewContactInitialPeerId(remotePeerId);
          setEditingContact(null);
          setShowContactsModal(true);
        }}
        onConnect={() => setSkippedConnection(false)}
        onChangeUsername={() => setUsernameSet(false)}
        username={username}
      />

      <MessageList messages={messages} isRemoteTyping={isRemoteTyping} />

      <MessageInput
        inputMessage={inputMessage}
        setInputMessage={setInputMessage}
        onSendMessage={handleSendMessage}
        onInputChange={handleInputChange}
        pendingImage={pendingImage}
        cancelPendingImage={() => setPendingImage(null)}
        connected={connected}
        isRecording={isRecording}
        recordingDuration={recordingDuration}
        startRecording={startRecording}
        stopRecording={stopRecording}
        cancelRecording={cancelRecording}
      />

      {callState === 'incoming' && (
        <IncomingCallModal
          remoteUsername={remoteUsername}
          incomingCallWithCamera={incomingCallWithCamera}
          onAccept={acceptCall}
          onReject={rejectCall}
        />
      )}

      <CallOverlay
        callState={callState}
        remoteUsername={remoteUsername}
        isCameraEnabled={isCameraEnabled}
        isMicEnabled={isMicEnabled}
        remoteHasCamera={remoteHasCamera}
        localVideoRef={localVideoRef}
        remoteVideoRef={remoteVideoRef}
        onToggleMic={toggleMic}
        onToggleCamera={toggleCamera}
        onEndCall={endCall}
      />

      {showContactsModal && (
        <ContactModal
          editingContact={editingContact}
          initialName={newContactInitialName}
          initialPeerId={newContactInitialPeerId}
          onSave={(name, pid) => {
            if (editingContact) updateContact(editingContact.id, name, pid);
            else addContact(name, pid);
            setShowContactsModal(false);
          }}
          onCancel={() => setShowContactsModal(false)}
        />
      )}
    </main>
  );
}

export default App;
