import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

let permissionGranted = false;

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
 * Show a desktop notification for a new message
 */
export async function showMessageNotification(
  senderName: string,
  roomName: string,
  preview: string
): Promise<void> {
  if (!permissionGranted) {
    permissionGranted = await isPermissionGranted();
    if (!permissionGranted) return;
  }

  try {
    sendNotification({
      title: `${senderName} - ${roomName}`,
      body: preview,
    });
  } catch (err) {
    console.error("Failed to send notification:", err);
  }
}
