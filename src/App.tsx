import { useState, useEffect, useRef, useCallback } from "react";
import { MessageCircle, StickyNote } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { compressImage, blobToDataUrl, isImageFile, formatFileSize } from "./utils/imageCompression";
import { useAuth } from "./contexts/AuthContext";
import { useServerConfig } from "./contexts/ServerConfigContext";
import { useUserStatus } from "./contexts/UserStatusContext";
import { useWebRTCCall } from "./hooks/useWebRTCCall";
// import { useContacts } from "./hooks/useContacts";
import { useVoiceRecorder } from "./hooks/useVoiceRecorder";
import { useRooms } from "./hooks/useRooms";
import { useNotes } from "./hooks/useNotes";
import { UserStatus } from "./types";
import { UpdateNoteRequest } from "./services/api";
// TODO: Restore Contact-related features in room context
// import { Contact } from "./types";

// Components
import { AuthScreen } from "./components/Auth/AuthScreen";
import { ServerConfigScreen } from "./components/ServerConfig/ServerConfigScreen";
import { RoomList } from "./components/Chat/RoomList";
import { RoomMessaging } from "./components/Chat/RoomMessaging";
import { RoomHeader } from "./components/Chat/RoomHeader";
import "./components/Chat/RoomHeader.css";
import { CreateRoomModal } from "./components/Chat/CreateRoomModal";
import { CallOverlay } from "./components/Call/CallOverlay";
import { IncomingCallModal } from "./components/Call/IncomingCallModal";
// import { ContactModal } from "./components/Contact/ContactModal";
import { AdminPanel } from "./components/Admin/AdminPanel";
import { NotesList, NoteEditor, LabelManager } from "./components/Notes";
import { ConnectionBanner } from "./components/ui/ConnectionBanner";

import "./App.css";

function App() {
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const { isLoading: serverLoading, isConfigured, resetConfig, selectedServer } = useServerConfig();
  const [inputMessage, setInputMessage] = useState("");
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [pendingImageBlob, setPendingImageBlob] = useState<Blob | null>(null);
  const [pendingFile, setPendingFile] = useState<{ file: File; name: string; size: number } | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);

  // Modals state
  // TODO: Implement contact management in room context
  // const [showContactsModal, setShowContactsModal] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showCreateRoomModal, setShowCreateRoomModal] = useState(false);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [createRoomError, setCreateRoomError] = useState<string | null>(null);
  // TODO: Implement contact editing in room context
  // const [editingContact, setEditingContact] = useState<Contact | null>(null);
  // const [newContactInitialName, setNewContactInitialName] = useState("");
  // const [newContactInitialUserId, setNewContactInitialUserId] = useState("");

  // App tabs state
  const [activeTab, setActiveTab] = useState<'chat' | 'notes'>('chat');

  // Notes view state
  const [notesView, setNotesView] = useState<'list' | 'editor' | 'labels'>('list');
  const [creatingNoteType, setCreatingNoteType] = useState<'note' | 'checklist'>('note');

  const username = user?.displayName || "";

  // User status - read from global cache, with local override for optimistic updates
  const { getStatus } = useUserStatus();
  const myStatusFromCache = user?.id ? getStatus(user.id) : undefined;

  // Local state for optimistic updates when user changes their own status
  const [localStatusOverride, setLocalStatusOverride] = useState<{
    status?: UserStatus;
    statusMessage?: string | null;
    isMuted?: boolean;
  } | null>(null);

  // Use local override if set, otherwise use cache
  const userStatus = localStatusOverride?.status ?? myStatusFromCache?.status ?? 'available';
  const userStatusMessage = localStatusOverride?.statusMessage ?? myStatusFromCache?.statusMessage ?? null;
  const userIsMuted = localStatusOverride?.isMuted ?? myStatusFromCache?.isMuted ?? false;
  const userStatusExpiresAt = myStatusFromCache?.statusExpiresAt ?? null;

  // Clear local override when cache updates (server confirmed the change)
  useEffect(() => {
    if (myStatusFromCache && localStatusOverride) {
      // If cache matches our local override, clear it
      if (myStatusFromCache.status === localStatusOverride.status) {
        setLocalStatusOverride(null);
      }
    }
  }, [myStatusFromCache, localStatusOverride]);

  const handleStatusChange = (status: UserStatus, statusMessage: string | null, isMuted: boolean) => {
    // Optimistic update
    setLocalStatusOverride({ status, statusMessage, isMuted });
  };

  const handleCreateRoom = async (name: string) => {
    setIsCreatingRoom(true);
    setCreateRoomError(null);
    try {
      await createRoom(name);
      setShowCreateRoomModal(false);
    } catch (error) {
      setCreateRoomError(error instanceof Error ? error.message : 'Erreur lors de la creation');
    } finally {
      setIsCreatingRoom(false);
    }
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
    sendFile,
    deleteMessage,
    reactToMessage,
    selectRoom,
    createRoom,
    deleteRoom,
    leaveRoom,
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

  // Notes - only load when authenticated
  const {
    notes,
    labels,
    selectedNote,
    selectedLabelId,
    isLoading: isLoadingNotes,
    error: notesError,
    loadNotes,
    selectNote,
    createNote,
    updateNote,
    deleteNote,
    togglePin,
    toggleChecklistItem,
    addChecklistItem,
    updateChecklistItemText,
    deleteChecklistItem,
    filterByLabel,
    createLabel,
    updateLabel,
    deleteLabel,
  } = useNotes({ enabled: isAuthenticated });

  // Notes handlers
  const handleCreateNote = useCallback((type: 'note' | 'checklist') => {
    setCreatingNoteType(type);
    selectNote(null);
    setNotesView('editor');
  }, [selectNote]);

  const handleSelectNote = useCallback((noteId: string) => {
    selectNote(noteId);
    setNotesView('editor');
  }, [selectNote]);

  const handleSaveNote = useCallback(async (noteId: string | null, data: UpdateNoteRequest) => {
    if (noteId) {
      await updateNote(noteId, data);
    } else {
      const newNote = await createNote({
        type: data.type || creatingNoteType,
        title: data.title,
        content: data.content,
        color: data.color,
        labels: data.labels,
        assignedTo: data.assignedTo,
      });
      if (newNote) {
        selectNote(newNote._id);
      }
    }
  }, [updateNote, createNote, creatingNoteType, selectNote]);

  const handleDeleteNoteFromEditor = useCallback(async (noteId: string) => {
    await deleteNote(noteId);
    setNotesView('list');
  }, [deleteNote]);

  const handleCloseNoteEditor = useCallback(() => {
    selectNote(null);
    setNotesView('list');
  }, [selectNote]);

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

  // File picker handler
  const handleSelectImageFile = async () => {
    try {
      const filePath = await open({
        multiple: false,
        directory: false,
        filters: [
          {
            name: 'Images',
            extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic']
          }
        ]
      });

      if (!filePath) return; // User cancelled

      console.log('Selected file:', filePath);
      setIsCompressing(true);

      // Read file as Uint8Array
      const fileData = await readFile(filePath as string);

      // Validate file size before compression
      if (fileData.byteLength > 10 * 1024 * 1024) {
        alert('L\'image est trop volumineuse (max 10MB)');
        setIsCompressing(false);
        return;
      }

      // Convert to Blob (guess MIME type from extension)
      const extension = (filePath as string).split('.').pop()?.toLowerCase();
      const mimeType = extension === 'png' ? 'image/png' :
                       extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' :
                       extension === 'gif' ? 'image/gif' :
                       extension === 'webp' ? 'image/webp' :
                       extension === 'heic' ? 'image/heic' :
                       'image/jpeg';

      const originalBlob = new Blob([fileData], { type: mimeType });

      if (!isImageFile(originalBlob)) {
        alert('Veuillez sélectionner un fichier image valide');
        setIsCompressing(false);
        return;
      }

      console.log(`Original file size: ${formatFileSize(originalBlob.size)}`);

      // Compress image
      const { compressedFile, originalSize, compressedSize } = await compressImage(originalBlob);

      // Warn if still large after compression
      if (compressedSize > 2 * 1024 * 1024) {
        console.warn(`Image still large after compression: ${formatFileSize(compressedSize)}`);
      }

      console.log(`Compressed: ${formatFileSize(originalSize)} → ${formatFileSize(compressedSize)}`);

      // Convert to Data URL for preview
      const dataUrl = await blobToDataUrl(compressedFile);

      setPendingImage(dataUrl);
      setPendingImageBlob(compressedFile);
      setIsCompressing(false);
    } catch (error) {
      console.error('File selection error:', error);
      alert(`Erreur: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
      setIsCompressing(false);
    }
  };

  // File picker handler (non-image files)
  const handleSelectFile = async () => {
    try {
      const filePath = await open({
        multiple: false,
        directory: false,
      });

      if (!filePath) return; // User cancelled

      console.log('Selected file:', filePath);

      // Read file as Uint8Array
      const fileData = await readFile(filePath as string);

      // Validate file size (25MB max)
      if (fileData.byteLength > 25 * 1024 * 1024) {
        alert('Le fichier est trop volumineux (max 25MB)');
        return;
      }

      // Extract filename from path
      const fileName = (filePath as string).split('/').pop() || (filePath as string).split('\\').pop() || 'file';

      // Guess MIME type from extension
      const extension = fileName.split('.').pop()?.toLowerCase() || '';
      const mimeTypes: Record<string, string> = {
        'pdf': 'application/pdf',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xls': 'application/vnd.ms-excel',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'ppt': 'application/vnd.ms-powerpoint',
        'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'txt': 'text/plain',
        'zip': 'application/zip',
        'rar': 'application/x-rar-compressed',
        '7z': 'application/x-7z-compressed',
        'mp4': 'video/mp4',
        'mov': 'video/quicktime',
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
      };
      const mimeType = mimeTypes[extension] || 'application/octet-stream';

      // Create File object
      const file = new File([fileData], fileName, { type: mimeType });

      setPendingFile({
        file,
        name: fileName,
        size: fileData.byteLength,
      });

    } catch (error) {
      console.error('File selection error:', error);
      alert(`Erreur: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }
  };

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
      <ConnectionBanner />

      {isCompressing && (
        <div className="loading-overlay">
          <div className="loading-spinner" />
          <p>Compression de l'image...</p>
        </div>
      )}

      {/* App Tabs Navigation */}
      <div className="app-tabs">
        <button
          className={`app-tab ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveTab('chat')}
        >
          <MessageCircle size={18} />
          <span>Chat</span>
        </button>
        <button
          className={`app-tab ${activeTab === 'notes' ? 'active' : ''}`}
          onClick={() => setActiveTab('notes')}
        >
          <StickyNote size={18} />
          <span>Notes</span>
        </button>
      </div>

      {/* Chat Tab Content */}
      {activeTab === 'chat' && (
      <div className="chat-layout">
        <RoomList
          rooms={rooms}
          currentRoomId={currentRoomId}
          currentUserId={user?.id}
          onSelectRoom={selectRoom}
          onCreateRoom={() => setShowCreateRoomModal(true)}
          onDeleteRoom={deleteRoom}
          onLeaveRoom={leaveRoom}
          isLoading={isLoadingRooms}
        />

        <div className="chat-main">
          {currentRoom && (
            <RoomHeader
              room={currentRoom}
              currentUserId={user?.id}
              username={username}
              serverName={selectedServer?.name}
              userStatus={userStatus}
              userStatusMessage={userStatusMessage}
              userStatusExpiresAt={userStatusExpiresAt}
              userIsMuted={userIsMuted}
              callState={callState}
              onStartCall={startCall}
              onStatusChange={handleStatusChange}
              onOpenSettings={() => setShowAdminPanel(true)}
              onChangeServer={handleChangeServer}
              onLogout={logout}
            />
          )}

          <RoomMessaging
            currentRoom={currentRoom}
            messages={messages}
            onSendMessage={(text, image, audio) => {
              sendMessage(text, image, audio, pendingImageBlob);
            }}
            onSendFile={sendFile}
            onDeleteMessage={deleteMessage}
            onReactMessage={reactToMessage}
            currentUserId={user?.id}
            inputMessage={inputMessage}
            setInputMessage={setInputMessage}
            pendingImage={pendingImage}
            cancelPendingImage={() => {
              setPendingImage(null);
              setPendingImageBlob(null);
            }}
            pendingFile={pendingFile}
            setPendingFile={setPendingFile}
            isRecording={isRecording}
            recordingDuration={recordingDuration}
            startRecording={startRecording}
            stopRecording={stopRecording}
            cancelRecording={cancelRecording}
            onSelectImageFile={handleSelectImageFile}
            onSelectFile={handleSelectFile}
          />
        </div>
      </div>
      )}

      {/* Notes Tab Content */}
      {activeTab === 'notes' && (
        <div className="notes-tab-content">
          {notesView === 'list' && (
            <NotesList
              notes={notes}
              labels={labels}
              selectedLabelId={selectedLabelId}
              isLoading={isLoadingNotes}
              error={notesError}
              onSelectNote={handleSelectNote}
              onCreateNote={handleCreateNote}
              onTogglePin={togglePin}
              onDeleteNote={deleteNote}
              onToggleChecklistItem={toggleChecklistItem}
              onFilterByLabel={filterByLabel}
              onRefresh={loadNotes}
              onManageLabels={() => setNotesView('labels')}
            />
          )}
          {notesView === 'editor' && (
            <NoteEditor
              note={selectedNote}
              labels={labels}
              isCreating={!selectedNote}
              initialType={creatingNoteType}
              onSave={handleSaveNote}
              onDelete={handleDeleteNoteFromEditor}
              onClose={handleCloseNoteEditor}
              onToggleChecklistItem={toggleChecklistItem}
              onAddChecklistItem={addChecklistItem}
              onUpdateChecklistItemText={updateChecklistItemText}
              onDeleteChecklistItem={deleteChecklistItem}
            />
          )}
          {notesView === 'labels' && (
            <LabelManager
              labels={labels}
              onCreateLabel={createLabel}
              onUpdateLabel={updateLabel}
              onDeleteLabel={deleteLabel}
              onClose={() => setNotesView('list')}
            />
          )}
        </div>
      )}

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

      {showCreateRoomModal && (
        <CreateRoomModal
          isLoading={isCreatingRoom}
          error={createRoomError}
          onSubmit={handleCreateRoom}
          onCancel={() => {
            setShowCreateRoomModal(false);
            setCreateRoomError(null);
          }}
        />
      )}
    </main>
  );
}

export default App;
