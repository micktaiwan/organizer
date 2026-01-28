import { useState, useEffect, useRef } from "react";
import { Globe } from "lucide-react";
import { AppTabsNavigation, AppTab } from "./components/AppTabsNavigation";
import { getCurrentWindow } from "@tauri-apps/api/window";

// Check if running in Tauri environment
const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
import { compressImage, blobToDataUrl } from "./utils/imageCompression";
import { initNotifications, consumePendingNotificationRoomId } from "./utils/notifications";
import { useAuth } from "./contexts/AuthContext";
import { useServerConfig } from "./contexts/ServerConfigContext";
import { useUserStatus } from "./contexts/UserStatusContext";
import { useMediaDevices } from "./contexts/MediaDevicesContext";
import { useWebRTCCall } from "./hooks/useWebRTCCall";
// import { useContacts } from "./hooks/useContacts";
import { useVoiceRecorder } from "./hooks/useVoiceRecorder";
import { useVideoRecorder } from "./hooks/useVideoRecorder";
import { useVideoRecordingHandlers } from "./hooks/useVideoRecordingHandlers";
import { useFileHandlers } from "./hooks/useFileHandlers";
import { useDebugPreferences } from "./hooks/useDebugPreferences";
import { useRooms } from "./hooks/useRooms";
import { useNotes } from "./hooks/useNotes";
import { useGallery } from "./hooks/useGallery";
import { useWindowState } from "./hooks/useWindowState";
import { UserStatus } from "./types";
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
import { SearchOverlay } from "./components/Chat/SearchOverlay";
import { CallOverlay } from "./components/Call/CallOverlay";
import { IncomingCallModal } from "./components/Call/IncomingCallModal";
// import { ContactModal } from "./components/Contact/ContactModal";
import { AdminPanel } from "./components/Admin/AdminPanel";
import { NotesTabContent } from "./components/NotesTabContent";
import { GalleryTabContent } from "./components/GalleryTabContent";
import { PetDebugScreen } from "./components/PetDebug";
import { LogPanel } from "./components/LogPanel";
import { SettingsScreen } from "./components/Settings";
import { ErrorIndicator } from "./components/ErrorIndicator";
import { StatusBar } from "./components/StatusBar";
import { ConfirmModal } from "./components/ui/ConfirmModal";
import { SourceSelectorModal, VideoPreviewModal } from "./components/Chat/VideoRecorder";

import "./App.css";

function App() {
  // Persist and restore window position/size
  useWindowState();

  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const { isLoading: serverLoading, isConfigured, resetConfig, selectedServer } = useServerConfig();
  const { selectedMicrophoneId, selectedCameraId } = useMediaDevices();
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
  const [showSearchOverlay, setShowSearchOverlay] = useState(false);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [createRoomError, setCreateRoomError] = useState<string | null>(null);
  // TODO: Implement contact editing in room context
  // const [editingContact, setEditingContact] = useState<Contact | null>(null);
  // const [newContactInitialName, setNewContactInitialName] = useState("");
  // const [newContactInitialUserId, setNewContactInitialUserId] = useState("");

  // App tabs state - persist last visited tab
  const [activeTab, setActiveTab] = useState<AppTab>(() => {
    const saved = localStorage.getItem('organizer-active-tab');
    if (saved === 'chat' || saved === 'notes' || saved === 'gallery' || saved === 'pet' || saved === 'settings') {
      return saved;
    }
    return 'chat';
  });

  // Persist active tab when it changes
  useEffect(() => {
    localStorage.setItem('organizer-active-tab', activeTab);
  }, [activeTab]);

  // Dev tools state (persisted)
  const {
    showLogPanel,
    setShowLogPanel,
    debugUseLocalServer,
    setDebugUseLocalServer,
    debugViewMode,
    setDebugViewMode,
  } = useDebugPreferences();

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
    sendVideo,
    deleteMessage,
    reactToMessage,
    selectRoom,
    createRoom,
    deleteRoom,
    leaveRoom,
    typingUsers,
    notifyTypingStart,
    notifyTypingStop,
    loadMessagesAround,
    returnToLatest,
    messageMode,
    targetMessageId,
    firstUnreadId,
    hasOlderUnread,
    skippedUnreadCount,
    hasMoreMessages,
    isLoadingMore,
    loadOlderMessages,
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
    incomingCallFrom,
    remoteUsername,
    localVideoRef,
    remoteVideoRef,
    remoteScreenVideoRef,
    isScreenSharing,
    remoteIsScreenSharing,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMic,
    toggleCamera,
    startScreenShare,
    stopScreenShare,
  } = useWebRTCCall({ pcRef, addSystemMessage: addCallSystemMessage, selectedMicrophoneId, selectedCameraId });

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

  // Video recording
  const {
    state: videoRecorderState,
    source: videoSource,
    quality: videoQuality,
    duration: videoDuration,
    previewUrl: videoPreviewUrl,
    videoBlob,
    error: videoError,
    stream: videoStream,
    uploadProgress: videoUploadProgress,
    setQuality: setVideoQuality,
    selectSource: selectVideoSource,
    startRecording: startVideoRecording,
    pauseRecording: pauseVideoRecording,
    resumeRecording: resumeVideoRecording,
    stopRecording: stopVideoRecording,
    discardVideo,
    restartRecording: restartVideoRecording,
    setUploading: setVideoUploading,
    setUploadProgress: setVideoUploadProgress,
    reset: resetVideoRecorder,
  } = useVideoRecorder();

  // Video recording handlers
  const {
    showVideoSourceSelector,
    handleStartVideoRecording,
    handleSelectVideoSource,
    handleCancelVideoSourceSelector,
    handleSendVideo,
    handleDiscardVideo,
    handleRestartVideo,
    handleCancelVideoRecording,
  } = useVideoRecordingHandlers({
    selectVideoSource,
    startVideoRecording,
    resetVideoRecorder,
    discardVideo,
    restartVideoRecording: restartVideoRecording,
    setVideoUploading,
    setVideoUploadProgress,
    sendVideo,
    videoBlob,
  });

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

  // Gallery
  const {
    files: galleryFiles,
    filter: galleryFilter,
    sort: gallerySort,
    searchQuery: gallerySearch,
    isLoading: isLoadingGallery,
    isLoadingMore: isLoadingMoreGallery,
    hasMore: galleryHasMore,
    setFilter: setGalleryFilter,
    setSort: setGallerySort,
    setSearch: setGallerySearch,
    loadMore: loadMoreGallery,
    deleteFile: deleteGalleryFile,
  } = useGallery({ enabled: isAuthenticated });

  useEffect(() => {
    if (isTauri()) {
      const title = import.meta.env.DEV ? "Organizer - Dev mode" : "Organizer";
      getCurrentWindow().setTitle(title);

      // Initialize desktop notifications
      initNotifications();
    }

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

  // Handle notification clicks via window focus
  // On macOS, clicking a notification brings the window to focus.
  // We store the roomId when showing the notification and navigate when focus is gained.
  useEffect(() => {
    if (!isTauri()) return;

    const unlisten = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused) {
        const pendingRoomId = consumePendingNotificationRoomId();
        if (pendingRoomId && pendingRoomId !== currentRoomId) {
          setActiveTab('chat');
          selectRoom(pendingRoomId);
        }
      }
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, [selectRoom, currentRoomId]);

  // Keyboard shortcut: Cmd+K (Mac) / Ctrl+K (Win) to open search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (activeTab === 'chat' && currentRoomId) {
          setShowSearchOverlay(prev => !prev);
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, currentRoomId]);

  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) continue;

          setIsCompressing(true);
          try {
            // Compress image like file picker
            const { compressedFile } = await compressImage(file);
            const dataUrl = await blobToDataUrl(compressedFile);

            setPendingImage(dataUrl);
            setPendingImageBlob(compressedFile);
          } catch (error) {
            console.error('Clipboard image compression error:', error);
          } finally {
            setIsCompressing(false);
          }
          break;
        }
      }
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, []);

  // File picker handlers
  const { handleSelectImageFile, handleSelectFile } = useFileHandlers({
    setPendingImage,
    setPendingImageBlob,
    setPendingFile,
    setIsCompressing,
  });

  const [showServerConfirm, setShowServerConfirm] = useState(false);

  const handleChangeServer = () => {
    setShowServerConfirm(true);
  };

  const confirmChangeServer = async () => {
    setShowServerConfirm(false);
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
    <div className={`app-root ${showLogPanel ? 'with-log-panel' : ''}`}>
    <main className="chat-container">
      <ErrorIndicator />

      {isCompressing && (
        <div className="loading-overlay">
          <div className="loading-spinner" />
          <p>Compression de l'image...</p>
        </div>
      )}

      {/* App Tabs Navigation */}
      <AppTabsNavigation activeTab={activeTab} onTabChange={setActiveTab} />

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
          username={username}
          onLogout={logout}
        />

        <div className="chat-main">
          {currentRoom && (
            <RoomHeader
              room={currentRoom}
              currentUserId={user?.id}
              username={username}
              userStatus={userStatus}
              userStatusMessage={userStatusMessage}
              userStatusExpiresAt={userStatusExpiresAt}
              userIsMuted={userIsMuted}
              callState={callState}
              onStartCall={startCall}
              onStatusChange={handleStatusChange}
              onOpenSearch={() => setShowSearchOverlay(true)}
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
            typingUsers={typingUsers}
            onTypingStart={notifyTypingStart}
            onTypingStop={notifyTypingStop}
            targetMessageId={targetMessageId}
            messageMode={messageMode}
            onReturnToLatest={returnToLatest}
            firstUnreadId={firstUnreadId}
            hasOlderUnread={hasOlderUnread}
            skippedUnreadCount={skippedUnreadCount}
            hasMoreMessages={hasMoreMessages}
            isLoadingMore={isLoadingMore}
            onLoadMore={loadOlderMessages}
            // Video recording
            videoRecorderState={videoRecorderState}
            videoSource={videoSource}
            videoStream={videoStream}
            videoDuration={videoDuration}
            onStartVideoRecording={handleStartVideoRecording}
            onPauseVideoRecording={pauseVideoRecording}
            onResumeVideoRecording={resumeVideoRecording}
            onStopVideoRecording={stopVideoRecording}
            onCancelVideoRecording={handleCancelVideoRecording}
          />
        </div>
      </div>
      )}

      {/* Notes Tab Content */}
      {activeTab === 'notes' && (
        <NotesTabContent
          notes={notes}
          labels={labels}
          selectedNote={selectedNote}
          selectedLabelId={selectedLabelId}
          isLoading={isLoadingNotes}
          error={notesError}
          loadNotes={loadNotes}
          selectNote={selectNote}
          createNote={createNote}
          updateNote={updateNote}
          deleteNote={deleteNote}
          togglePin={togglePin}
          toggleChecklistItem={toggleChecklistItem}
          addChecklistItem={addChecklistItem}
          updateChecklistItemText={updateChecklistItemText}
          deleteChecklistItem={deleteChecklistItem}
          filterByLabel={filterByLabel}
          createLabel={createLabel}
          updateLabel={updateLabel}
          deleteLabel={deleteLabel}
        />
      )}

      {/* Gallery Tab Content */}
      {activeTab === 'gallery' && (
        <GalleryTabContent
          files={galleryFiles}
          filter={galleryFilter}
          sort={gallerySort}
          searchQuery={gallerySearch}
          isLoading={isLoadingGallery}
          isLoadingMore={isLoadingMoreGallery}
          hasMore={galleryHasMore}
          currentUserId={user?.id}
          onFilterChange={setGalleryFilter}
          onSortChange={setGallerySort}
          onSearchChange={setGallerySearch}
          onLoadMore={loadMoreGallery}
          onDeleteFile={deleteGalleryFile}
        />
      )}

      {/* Pet Debug Tab Content */}
      {activeTab === 'pet' && (
        <div className="pet-tab-content">
          <PetDebugScreen
            showLogPanel={showLogPanel}
            onToggleLogPanel={() => setShowLogPanel(!showLogPanel)}
            useLocalServer={debugUseLocalServer}
            onUseLocalServerChange={setDebugUseLocalServer}
            viewMode={debugViewMode}
            onViewModeChange={setDebugViewMode}
          />
        </div>
      )}

      {/* Settings Tab Content */}
      {activeTab === 'settings' && <SettingsScreen />}

      <StatusBar
        onOpenAdmin={() => setShowAdminPanel(true)}
        onChangeServer={handleChangeServer}
        serverName={selectedServer?.name}
        currentRoomId={currentRoomId}
      />

      {callState === 'incoming' && incomingCallFrom && (
        <IncomingCallModal
          remoteUsername={incomingCallFrom.username}
          incomingCallWithCamera={incomingCallWithCamera}
          onAccept={acceptCall}
          onReject={rejectCall}
        />
      )}

      <CallOverlay
        callState={callState}
        remoteUsername={remoteUsername || 'Utilisateur'}
        isCameraEnabled={isCameraEnabled}
        isMicEnabled={isMicEnabled}
        remoteHasCamera={remoteHasCamera}
        localVideoRef={localVideoRef}
        remoteVideoRef={remoteVideoRef}
        remoteScreenVideoRef={remoteScreenVideoRef}
        isScreenSharing={isScreenSharing}
        remoteIsScreenSharing={remoteIsScreenSharing}
        onToggleMic={toggleMic}
        onToggleCamera={toggleCamera}
        onStartScreenShare={startScreenShare}
        onStopScreenShare={stopScreenShare}
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

      {showServerConfirm && (
        <ConfirmModal
          icon={Globe}
          title="Changer de serveur"
          message="Vous allez être déconnecté et redirigé vers le choix de serveur."
          confirmLabel="Se déconnecter"
          variant="danger"
          onConfirm={confirmChangeServer}
          onCancel={() => setShowServerConfirm(false)}
        />
      )}

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

      {showSearchOverlay && currentRoomId && (
        <SearchOverlay
          roomId={currentRoomId}
          isOpen={showSearchOverlay}
          onClose={() => setShowSearchOverlay(false)}
          onSelectResult={(timestamp, messageId) => {
            loadMessagesAround(timestamp, messageId);
          }}
        />
      )}

      {/* Video Recording Modals */}
      {showVideoSourceSelector && (
        <SourceSelectorModal
          quality={videoQuality}
          onQualityChange={setVideoQuality}
          onSelect={handleSelectVideoSource}
          onCancel={handleCancelVideoSourceSelector}
          error={videoError}
        />
      )}

      {(videoRecorderState === 'previewing' || videoRecorderState === 'uploading') && videoPreviewUrl && (
        <VideoPreviewModal
          previewUrl={videoPreviewUrl}
          duration={videoDuration}
          isUploading={videoRecorderState === 'uploading'}
          uploadProgress={videoUploadProgress}
          onSend={handleSendVideo}
          onDiscard={handleDiscardVideo}
          onRestart={handleRestartVideo}
        />
      )}
    </main>

    {/* Dev: Log Panel */}
    {showLogPanel && <LogPanel useLocalServer={debugUseLocalServer} onClose={() => setShowLogPanel(false)} />}
    </div>
  );
}

export default App;
