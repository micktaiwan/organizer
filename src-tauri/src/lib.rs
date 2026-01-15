use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{
    image::Image,
    menu::{CheckMenuItem, Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, RunEvent, WindowEvent, Wry,
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_store::StoreExt;

// Settings keys for persistent storage
const SETTINGS_AUTOSTART: &str = "settings_autostart";
const SETTINGS_MINIMIZE_TO_TRAY: &str = "settings_minimize_to_tray";

// Badge radius and color
const BADGE_RADIUS: u32 = 6;
const BADGE_COLOR: [u8; 4] = [255, 59, 48, 255]; // Red color (RGBA)

// State to hold references to tray menu items and settings state
struct TrayMenuState {
    autostart: CheckMenuItem<Wry>,
    minimize_to_tray: CheckMenuItem<Wry>,
    autostart_enabled: AtomicBool,
    minimize_enabled: AtomicBool,
}

// Store original icon for badge overlay
struct TrayIconState {
    original_icon: Vec<u8>,
    width: u32,
    height: u32,
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn set_tray_badge(app: AppHandle, has_badge: bool) -> Result<(), String> {
    let icon_state = app
        .try_state::<Arc<TrayIconState>>()
        .ok_or("Icon state not found")?;

    let tray = app
        .tray_by_id("main")
        .ok_or("Tray not found")?;

    if has_badge {
        // Create icon with badge
        let icon_with_badge = create_badge_icon(
            &icon_state.original_icon,
            icon_state.width,
            icon_state.height,
        )
        .map_err(|e| e.to_string())?;

        let new_icon = Image::new_owned(
            icon_with_badge,
            icon_state.width,
            icon_state.height,
        );
        tray.set_icon(Some(new_icon)).map_err(|e| e.to_string())?;
    } else {
        // Restore original icon
        let original = Image::new_owned(
            icon_state.original_icon.clone(),
            icon_state.width,
            icon_state.height,
        );
        tray.set_icon(Some(original)).map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn clear_tray_badge(app: &AppHandle) {
    if let Some(icon_state) = app.try_state::<Arc<TrayIconState>>() {
        if let Some(tray) = app.tray_by_id("main") {
            let original = Image::new_owned(
                icon_state.original_icon.clone(),
                icon_state.width,
                icon_state.height,
            );
            let _ = tray.set_icon(Some(original));
        }
    }
}

fn create_badge_icon(original: &[u8], width: u32, height: u32) -> Result<Vec<u8>, String> {
    // Clone the original RGBA data
    let mut pixels = original.to_vec();

    // Calculate badge position (top-right corner)
    let badge_center_x = width - BADGE_RADIUS - 2;
    let badge_center_y = BADGE_RADIUS + 2;

    // Draw filled circle for badge
    for y in 0..height {
        for x in 0..width {
            let dx = x as i32 - badge_center_x as i32;
            let dy = y as i32 - badge_center_y as i32;
            let distance_sq = dx * dx + dy * dy;

            if distance_sq <= (BADGE_RADIUS * BADGE_RADIUS) as i32 {
                let idx = ((y * width + x) * 4) as usize;
                if idx + 3 < pixels.len() {
                    pixels[idx] = BADGE_COLOR[0];     // R
                    pixels[idx + 1] = BADGE_COLOR[1]; // G
                    pixels[idx + 2] = BADGE_COLOR[2]; // B
                    pixels[idx + 3] = BADGE_COLOR[3]; // A
                }
            }
        }
    }

    Ok(pixels)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            // Load saved settings from store
            let (autostart_enabled, minimize_to_tray_enabled) = {
                let store = app.store("settings.json")?;
                let autostart = store
                    .get(SETTINGS_AUTOSTART)
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                let minimize = store
                    .get(SETTINGS_MINIMIZE_TO_TRAY)
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                (autostart, minimize)
            };

            // Sync autostart state with system on startup
            {
                use tauri_plugin_autostart::ManagerExt;
                let autostart_manager = app.autolaunch();
                if autostart_enabled {
                    let _ = autostart_manager.enable();
                } else {
                    let _ = autostart_manager.disable();
                }
            }

            // Get original icon data for badge overlay
            let icon = app.default_window_icon().unwrap().clone();
            let icon_rgba = icon.rgba().to_vec();
            let icon_width = icon.width();
            let icon_height = icon.height();

            // Store original icon state
            app.manage(Arc::new(TrayIconState {
                original_icon: icon_rgba.clone(),
                width: icon_width,
                height: icon_height,
            }));

            // Create tray menu items
            let show = MenuItem::with_id(app, "show", "Show Organizer", true, None::<&str>)?;
            let separator1 = tauri::menu::PredefinedMenuItem::separator(app)?;
            let autostart_item = CheckMenuItem::with_id(
                app,
                "autostart",
                "Start with System",
                true,
                autostart_enabled,
                None::<&str>,
            )?;
            let minimize_item = CheckMenuItem::with_id(
                app,
                "minimize_to_tray",
                "Minimize to Tray on Close",
                true,
                minimize_to_tray_enabled,
                None::<&str>,
            )?;
            let separator2 = tauri::menu::PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

            // Store references to check menu items and state for later access
            app.manage(Arc::new(TrayMenuState {
                autostart: autostart_item.clone(),
                minimize_to_tray: minimize_item.clone(),
                autostart_enabled: AtomicBool::new(autostart_enabled),
                minimize_enabled: AtomicBool::new(minimize_to_tray_enabled),
            }));

            let menu = Menu::with_items(
                app,
                &[
                    &show,
                    &separator1,
                    &autostart_item,
                    &minimize_item,
                    &separator2,
                    &quit,
                ],
            )?;

            // Create tray icon with ID "main"
            let _tray = TrayIconBuilder::with_id("main")
                .icon(icon)
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                        // Clear badge when showing window
                        clear_tray_badge(app);
                    }
                    "autostart" => {
                        if let Some(state) = app.try_state::<Arc<TrayMenuState>>() {
                            // Toggle state
                            let current = state.autostart_enabled.load(Ordering::SeqCst);
                            let new_state = !current;
                            state.autostart_enabled.store(new_state, Ordering::SeqCst);

                            // Update checkbox visual
                            let _ = state.autostart.set_checked(new_state);

                            // Enable/disable system autostart
                            {
                                use tauri_plugin_autostart::ManagerExt;
                                let autostart_manager = app.autolaunch();
                                if new_state {
                                    let _ = autostart_manager.enable();
                                } else {
                                    let _ = autostart_manager.disable();
                                }
                            }

                            // Save to store
                            if let Ok(store) = app.store("settings.json") {
                                let _ = store.set(SETTINGS_AUTOSTART.to_string(), serde_json::json!(new_state));
                                let _ = store.save();
                            }
                        }
                    }
                    "minimize_to_tray" => {
                        if let Some(state) = app.try_state::<Arc<TrayMenuState>>() {
                            // Toggle state
                            let current = state.minimize_enabled.load(Ordering::SeqCst);
                            let new_state = !current;
                            state.minimize_enabled.store(new_state, Ordering::SeqCst);

                            // Update checkbox visual
                            let _ = state.minimize_to_tray.set_checked(new_state);

                            // Save to store
                            if let Ok(store) = app.store("settings.json") {
                                let _ = store.set(SETTINGS_MINIMIZE_TO_TRAY.to_string(), serde_json::json!(new_state));
                                let _ = store.save();
                            }
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                        // Clear badge when clicking tray icon
                        clear_tray_badge(&app);
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            match event {
                WindowEvent::CloseRequested { api, .. } => {
                    let app = window.app_handle();

                    // Check if minimize to tray is enabled from in-memory state
                    let minimize_enabled = app
                        .try_state::<Arc<TrayMenuState>>()
                        .map(|state| state.minimize_enabled.load(Ordering::SeqCst))
                        .unwrap_or(false);

                    if minimize_enabled {
                        // Hide window instead of closing
                        let _ = window.hide();
                        api.prevent_close();
                    }
                    // If not enabled, allow normal close behavior (app exits)
                }
                WindowEvent::Focused(focused) => {
                    if *focused {
                        // Clear badge when window gets focus
                        let app = window.app_handle();
                        clear_tray_badge(&app);
                    }
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![greet, set_tray_badge])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let RunEvent::ExitRequested { api, code, .. } = event {
            // Only prevent exit if this is a user-initiated close (not explicit quit)
            if code.is_none() {
                let minimize_enabled = app_handle
                    .try_state::<Arc<TrayMenuState>>()
                    .map(|state| state.minimize_enabled.load(Ordering::SeqCst))
                    .unwrap_or(false);

                if minimize_enabled {
                    api.prevent_exit();
                }
            }
        }
    });
}
