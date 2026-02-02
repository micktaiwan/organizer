import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

let permissionGranted = false;

// Key for storing pending notification navigation
const PENDING_NOTIFICATION_KEY = "organizer-pending-notification-roomId";

/**
 * Initialize notification permissions (call on app startup)
 */
export async function initNotifications(): Promise<boolean> {
  try {
    permissionGranted = await isPermissionGranted();
    if (!permissionGranted) {
      const permission = await requestPermission();
      permissionGranted = permission === "granted";
    }
    return permissionGranted;
  } catch (err) {
    console.error("Failed to initialize notifications:", err);
    return false;
  }
}

/**
 * Show a desktop notification for a new message.
 * Stores the roomId so the app can navigate to it when the window gains focus
 * (macOS doesn't support notification click callbacks, but clicking a notification
 * brings the app window to focus).
 */
export async function showMessageNotification(
  senderName: string,
  roomName: string,
  preview: string,
  roomId?: string
): Promise<void> {
  if (!permissionGranted) {
    permissionGranted = await isPermissionGranted();
    if (!permissionGranted) return;
  }

  try {
    // Store the roomId for navigation when window gains focus
    if (roomId) {
      localStorage.setItem(PENDING_NOTIFICATION_KEY, roomId);
    }

    sendNotification({
      title: `${senderName} - ${roomName}`,
      body: preview,
    });
  } catch (err) {
    console.error("Failed to send notification:", err);
  }
}

/**
 * Show a desktop notification when a user comes online.
 */
export async function showPresenceNotification(displayName: string): Promise<void> {
  if (!permissionGranted) {
    permissionGranted = await isPermissionGranted();
    if (!permissionGranted) return;
  }
  try {
    sendNotification({
      title: `${displayName} is online`,
      body: `${displayName} just connected`,
    });
  } catch (err) {
    console.error("Failed to send presence notification:", err);
  }
}

/**
 * Get and clear the pending notification roomId.
 * Call this when the window gains focus to navigate to the room.
 */
export function consumePendingNotificationRoomId(): string | null {
  const roomId = localStorage.getItem(PENDING_NOTIFICATION_KEY);
  if (roomId) {
    localStorage.removeItem(PENDING_NOTIFICATION_KEY);
  }
  return roomId;
}
