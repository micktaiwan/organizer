import { useState, useEffect, useRef } from "react";
import { Settings, Globe, LogOut } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAuth } from "./contexts/AuthContext";
import { useServerConfig } from "./contexts/ServerConfigContext";
import { useWebRTCCall } from "./hooks/useWebRTCCall";
// import { useContacts } from "./hooks/useContacts";
import { useVoiceRecorder } from "./hooks/useVoiceRecorder";
import { useRooms } from "./hooks/useRooms";
import { Button } from "./components/ui/Button";
import { StatusSelector } from "./components/ui/StatusSelector";
import { UserStatus } from "./types";
// TODO: Restore Contact-related features in room context
// import { Contact } from "./types";

// Components
import { AuthScreen } from "./components/Auth/AuthScreen";
import { ServerConfigScreen } from "./components/ServerConfig/ServerConfigScreen";
import { RoomList } from "./components/Chat/RoomList";
import { RoomMessaging } from "./components/Chat/RoomMessaging";
import { RoomMembers } from "./components/Chat/RoomMembers";
import { CallOverlay } from "./components/Call/CallOverlay";
import { IncomingCallModal } from "./components/Call/IncomingCallModal";
// import { ContactModal } from "./components/Contact/ContactModal";
import { AdminPanel } from "./components/Admin/AdminPanel";

import "./App.css";

function App() {
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const { isLoading: serverLoading, isConfigured, resetConfig, selectedServer } = useServerConfig();
  const [inputMessage, setInputMessage] = useState("");
  const [pendingImage, setPendingImage] = useState<string | null>(null);

  // Modals state
  // TODO: Implement contact management in room context
  // const [showContactsModal, setShowContactsModal] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  // TODO: Implement contact editing in room context
  // const [editingContact, setEditingContact] = useState<Contact | null>(null);
  // const [newContactInitialName, setNewContactInitialName] = useState("");
  // const [newContactInitialUserId, setNewContactInitialUserId] = useState("");

  const username = user?.displayName || "";

  // User status
  const [userStatus, setUserStatus] = useState<UserStatus>('available');
  const [userStatusMessage, setUserStatusMessage] = useState<string | null>(null);
  const [userIsMuted, setUserIsMuted] = useState(false);

  const handleStatusChange = (status: UserStatus, statusMessage: string | null, isMuted: boolean) => {
    setUserStatus(status);
    setUserStatusMessage(statusMessage);
    setUserIsMuted(isMuted);
  };

  // Room and messaging
  const {
    rooms,
    currentRoomId,
    currentRoom,
    isLoadingRooms,
    messages,
    setMessages,
    sendMessage,
    deleteMessage,
    selectRoom,
  } = useRooms({ userId: user?.id, username });

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

  // Create empty pcRef for future calls implementation
  const pcRef = useRef<RTCPeerConnection | null>(null);

  // TODO: Adapt useWebRTCCall for room context
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
    toggleCamera,
  } = useWebRTCCall({ pcRef, addSystemMessage: addCallSystemMessage });

  // TODO: Implement contact management in room context
  // const {
  //   addContact,
  //   updateContact,
  //   isUserSaved,
  //   getContactName
  // } = useContacts();

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

    // Add welcome message with build info
    const welcomeMessage = {
      id: "welcome-system-msg",
      text: `Welcome to Organizer (v${__APP_VERSION__})\nBuild: ${__BUILD_TIMESTAMP__}`,
      sender: "me" as const,
      timestamp: new Date(),
      isSystemMessage: true,
      systemMessageType: "ended-call" as const,
    };
    setMessages([welcomeMessage]);
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

  const handleChangeServer = async () => {
    await logout();
    await resetConfig();
  };

  // Loading state
  if (serverLoading || (isConfigured && authLoading)) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Chargement...</p>
      </div>
    );
  }

  // Server not configured - show server selection
  if (!isConfigured) {
    return <ServerConfigScreen />;
  }

  // Not authenticated - show login/register
  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  return (
    <main className="chat-container">
      <div className="chat-layout">
        <RoomList
          rooms={rooms}
          currentRoomId={currentRoomId}
          onSelectRoom={selectRoom}
          isLoading={isLoadingRooms}
        />

        <div className="chat-main">
          {currentRoom && (
            <div className="chat-room-header">
              <h2>{currentRoom.name}</h2>
              <div className="room-header-actions">
                <RoomMembers
                  room={currentRoom}
                  currentUserId={user?.id}
                  onStartCall={startCall}
                  callState={callState}
                />
                <div className="header-group header-secondary">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Settings size={18} />}
                    onClick={() => setShowAdminPanel(true)}
                    title="Administration"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Globe size={18} />}
                    onClick={handleChangeServer}
                    title={`Serveur: ${selectedServer?.name || 'Inconnu'}`}
                  />
                </div>
                <div className="header-group header-user">
                  <StatusSelector
                    currentStatus={userStatus}
                    currentStatusMessage={userStatusMessage}
                    currentIsMuted={userIsMuted}
                    onStatusChange={handleStatusChange}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<LogOut size={18} />}
                    onClick={logout}
                  >
                    {username}
                  </Button>
                </div>
              </div>
            </div>
          )}

          <RoomMessaging
            currentRoom={currentRoom}
            messages={messages}
            onSendMessage={(text, image, audio) => {
              sendMessage(text, image, audio);
            }}
            onDeleteMessage={deleteMessage}
            inputMessage={inputMessage}
            setInputMessage={setInputMessage}
            pendingImage={pendingImage}
            cancelPendingImage={() => setPendingImage(null)}
            isRecording={isRecording}
            recordingDuration={recordingDuration}
            startRecording={startRecording}
            stopRecording={stopRecording}
            cancelRecording={cancelRecording}
          />
        </div>
      </div>

      {callState === 'incoming' && (
        <IncomingCallModal
          remoteUsername="Appel entrant"
          incomingCallWithCamera={incomingCallWithCamera}
          onAccept={acceptCall}
          onReject={rejectCall}
        />
      )}

      <CallOverlay
        callState={callState}
        remoteUsername="En appel"
        isCameraEnabled={isCameraEnabled}
        isMicEnabled={isMicEnabled}
        remoteHasCamera={remoteHasCamera}
        localVideoRef={localVideoRef}
        remoteVideoRef={remoteVideoRef}
        onToggleMic={toggleMic}
        onToggleCamera={toggleCamera}
        onEndCall={endCall}
      />

      {/* TODO: Implement contact management in room context */}
      {/* {showContactsModal && (
        <ContactModal
          editingContact={editingContact}
          initialName={newContactInitialName}
          initialUserId={newContactInitialUserId}
          onSave={(name, uid) => {
            if (editingContact) updateContact(editingContact.id, name, uid);
            else addContact(name, uid);
            setShowContactsModal(false);
          }}
          onCancel={() => setShowContactsModal(false)}
        />
      )} */}

      {showAdminPanel && (
        <AdminPanel onClose={() => setShowAdminPanel(false)} />
      )}
    </main>
  );
}

export default App;
