use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{
    image::Image,
    menu::{CheckMenuItem, Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, RunEvent, WindowEvent, Wry,
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_store::StoreExt;
#[cfg(not(target_os = "macos"))]
use sysinfo::Disks;

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

#[derive(serde::Serialize)]
struct DiskSpace {
    free_gb: f64,
    total_gb: f64,
}

#[derive(serde::Serialize)]
struct ProcessMemory {
    pid: u32,
    name: String,
    cwd: Option<String>, // Current working directory (last segment only)
    memory_mb: f64,      // Resident memory (in RAM)
    virtual_mb: f64,     // Virtual memory (includes swap)
}

#[derive(serde::Serialize)]
struct ProcessDetails {
    pid: u32,
    name: String,
    status: String,              // Running, Sleeping, Zombie...
    user: Option<String>,        // Username (via ps command)
    parent_pid: Option<u32>,
    exe_path: Option<String>,    // Full path to executable
    cwd: Option<String>,         // Full working directory
    cmd_args: Vec<String>,       // Command line arguments
    start_time: Option<u64>,     // Unix timestamp
    cpu_usage: f32,              // Percentage
    memory_mb: f64,              // Physical memory
    virtual_mb: f64,             // Virtual memory
    disk_read_bytes: u64,
    disk_write_bytes: u64,
}

#[derive(serde::Serialize)]
struct MemoryInfo {
    total_gb: f64,
    used_gb: f64,
    available_gb: f64,
    free_gb: f64,
    app_gb: f64,
    wired_gb: f64,
    compressed_gb: f64,
    cached_gb: f64,
    swap_total_gb: f64,
    swap_used_gb: f64,
}

// macOS: use host_statistics64 for accurate memory info like Activity Monitor
#[cfg(target_os = "macos")]
#[tauri::command]
fn get_memory_info() -> MemoryInfo {
    use std::mem;

    // Match exact macOS struct layout: natural_t = u32, some fields are u64
    #[repr(C)]
    struct VmStatistics64 {
        free_count: u32,              // natural_t
        active_count: u32,            // natural_t
        inactive_count: u32,          // natural_t
        wire_count: u32,              // natural_t
        zero_fill_count: u64,
        reactivations: u64,
        pageins: u64,
        pageouts: u64,
        faults: u64,
        cow_faults: u64,
        lookups: u64,
        hits: u64,
        purges: u64,
        purgeable_count: u32,         // natural_t
        speculative_count: u32,       // natural_t
        decompressions: u64,
        compressions: u64,
        swapins: u64,
        swapouts: u64,
        compressor_page_count: u32,   // natural_t
        throttled_count: u32,         // natural_t
        external_page_count: u32,     // natural_t
        internal_page_count: u32,     // natural_t
        total_uncompressed_pages_in_compressor: u64,
    }

    extern "C" {
        fn mach_host_self() -> u32;
        fn host_statistics64(
            host: u32,
            flavor: i32,
            info: *mut VmStatistics64,
            count: *mut u32,
        ) -> i32;
        fn host_page_size(host: u32, page_size: *mut u32) -> i32;
    }

    const HOST_VM_INFO64: i32 = 4;

    let mut vm_stat: VmStatistics64 = unsafe { mem::zeroed() };
    let mut count = (mem::size_of::<VmStatistics64>() / mem::size_of::<u32>()) as u32;
    let mut page_size: u32 = 4096;

    let host = unsafe { mach_host_self() };
    unsafe { host_page_size(host, &mut page_size) };
    let result = unsafe { host_statistics64(host, HOST_VM_INFO64, &mut vm_stat, &mut count) };

    if result != 0 {
        // Fallback to sysinfo if mach call fails
        return get_memory_info_fallback();
    }

    let page_to_gb = |pages: u64| (pages as f64 * page_size as f64) / 1_073_741_824.0;

    // Get total memory via sysctl
    let total_bytes = {
        use std::process::Command;
        Command::new("sysctl")
            .args(["-n", "hw.memsize"])
            .output()
            .ok()
            .and_then(|o| String::from_utf8_lossy(&o.stdout).trim().parse::<u64>().ok())
            .unwrap_or(0)
    };
    let total_gb = total_bytes as f64 / 1_073_741_824.0;

    // Calculate memory categories like Activity Monitor (cast u32 to u64)
    let free_pages = (vm_stat.free_count as u64).saturating_sub(vm_stat.speculative_count as u64);
    let app_pages = (vm_stat.internal_page_count as u64).saturating_sub(vm_stat.purgeable_count as u64);
    let cached_pages = vm_stat.purgeable_count as u64 + vm_stat.external_page_count as u64;

    let free_gb = page_to_gb(free_pages);
    let app_gb = page_to_gb(app_pages);
    let wired_gb = page_to_gb(vm_stat.wire_count as u64);
    let compressed_gb = page_to_gb(vm_stat.compressor_page_count as u64);
    let cached_gb = page_to_gb(cached_pages);

    // Used = App + Wired + Compressed
    let used_gb = app_gb + wired_gb + compressed_gb;
    // Available = Free + Inactive (pages that can be reclaimed)
    let available_gb = page_to_gb(free_pages + vm_stat.inactive_count as u64);

    // Swap via sysinfo
    let (swap_total_gb, swap_used_gb) = {
        use sysinfo::System;
        let mut sys = System::new();
        sys.refresh_memory();
        let to_gb = |b: u64| b as f64 / 1_073_741_824.0;
        (to_gb(sys.total_swap()), to_gb(sys.used_swap()))
    };

    MemoryInfo {
        total_gb,
        used_gb,
        available_gb,
        free_gb,
        app_gb,
        wired_gb,
        compressed_gb,
        cached_gb,
        swap_total_gb,
        swap_used_gb,
    }
}

#[cfg(target_os = "macos")]
fn get_memory_info_fallback() -> MemoryInfo {
    use sysinfo::System;
    let mut sys = System::new();
    sys.refresh_memory();
    let to_gb = |b: u64| b as f64 / 1_073_741_824.0;
    let total = sys.total_memory();
    let used = sys.used_memory();
    MemoryInfo {
        total_gb: to_gb(total),
        used_gb: to_gb(used),
        available_gb: to_gb(total.saturating_sub(used)),
        free_gb: to_gb(sys.free_memory()),
        app_gb: 0.0,
        wired_gb: 0.0,
        compressed_gb: 0.0,
        cached_gb: 0.0,
        swap_total_gb: to_gb(sys.total_swap()),
        swap_used_gb: to_gb(sys.used_swap()),
    }
}

// Windows/Linux: use sysinfo
#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn get_memory_info() -> MemoryInfo {
    use sysinfo::System;
    let mut sys = System::new();
    sys.refresh_memory();

    let to_gb = |b: u64| b as f64 / 1_073_741_824.0;

    let total = sys.total_memory();
    let used = sys.used_memory();
    let available = sys.available_memory();

    MemoryInfo {
        total_gb: to_gb(total),
        used_gb: to_gb(used),
        available_gb: if available > 0 { to_gb(available) } else { to_gb(total.saturating_sub(used)) },
        free_gb: to_gb(sys.free_memory()),
        app_gb: 0.0,  // Not available on Windows/Linux via sysinfo
        wired_gb: 0.0,
        compressed_gb: 0.0,
        cached_gb: 0.0,
        swap_total_gb: to_gb(sys.total_swap()),
        swap_used_gb: to_gb(sys.used_swap()),
    }
}

// macOS: use proc_pid_rusage for accurate memory footprint like Activity Monitor
#[cfg(target_os = "macos")]
#[tauri::command]
fn get_top_processes(limit: usize) -> Vec<ProcessMemory> {
    use sysinfo::System;
    use std::mem;

    #[repr(C)]
    struct RUsageInfoV4 {
        ri_uuid: [u8; 16],
        ri_user_time: u64,
        ri_system_time: u64,
        ri_pkg_idle_wkups: u64,
        ri_interrupt_wkups: u64,
        ri_pageins: u64,
        ri_wired_size: u64,
        ri_resident_size: u64,
        ri_phys_footprint: u64,
        ri_proc_start_abstime: u64,
        ri_proc_exit_abstime: u64,
        ri_child_user_time: u64,
        ri_child_system_time: u64,
        ri_child_pkg_idle_wkups: u64,
        ri_child_interrupt_wkups: u64,
        ri_child_pageins: u64,
        ri_child_elapsed_abstime: u64,
        ri_diskio_bytesread: u64,
        ri_diskio_byteswritten: u64,
        ri_cpu_time_qos_default: u64,
        ri_cpu_time_qos_maintenance: u64,
        ri_cpu_time_qos_background: u64,
        ri_cpu_time_qos_utility: u64,
        ri_cpu_time_qos_legacy: u64,
        ri_cpu_time_qos_user_initiated: u64,
        ri_cpu_time_qos_user_interactive: u64,
        ri_billed_system_time: u64,
        ri_serviced_system_time: u64,
        ri_logical_writes: u64,
        ri_lifetime_max_phys_footprint: u64,
        ri_instructions: u64,
        ri_cycles: u64,
        ri_billed_energy: u64,
        ri_serviced_energy: u64,
        ri_interval_max_phys_footprint: u64,
        ri_runnable_time: u64,
    }

    extern "C" {
        fn proc_pid_rusage(pid: i32, flavor: i32, buffer: *mut RUsageInfoV4) -> i32;
    }

    const RUSAGE_INFO_V4: i32 = 4;

    let mut sys = System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    let to_mb = |b: u64| b as f64 / 1_048_576.0;

    let mut processes: Vec<ProcessMemory> = sys
        .processes()
        .iter()
        .map(|(pid, process)| {
            let pid_u32 = pid.as_u32();

            // Try to get phys_footprint via proc_pid_rusage
            let mut rusage: RUsageInfoV4 = unsafe { mem::zeroed() };
            let footprint = if unsafe { proc_pid_rusage(pid_u32 as i32, RUSAGE_INFO_V4, &mut rusage) } == 0 {
                rusage.ri_phys_footprint
            } else {
                // Fallback to sysinfo memory
                process.memory()
            };

            ProcessMemory {
                pid: pid_u32,
                name: process.name().to_string_lossy().to_string(),
                cwd: None, // Will be filled later via lsof
                memory_mb: to_mb(footprint),
                virtual_mb: to_mb(process.virtual_memory()),
            }
        })
        .collect();

    // Sort by memory descending
    processes.sort_by(|a, b| b.memory_mb.partial_cmp(&a.memory_mb).unwrap_or(std::cmp::Ordering::Equal));

    // Return top N
    processes.truncate(limit);

    // Get cwd for top processes via lsof (more reliable on macOS)
    if !processes.is_empty() {
        let pids: Vec<String> = processes.iter().map(|p| p.pid.to_string()).collect();
        if let Ok(output) = std::process::Command::new("lsof")
            .args(["-d", "cwd", "-a", "-p", &pids.join(","), "-Fn"])
            .output()
        {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let mut current_pid: Option<u32> = None;
                for line in stdout.lines() {
                    if let Some(pid_str) = line.strip_prefix('p') {
                        current_pid = pid_str.parse().ok();
                    } else if let Some(name) = line.strip_prefix('n') {
                        if let Some(pid) = current_pid {
                            // Extract last segment of path
                            if let Some(proc) = processes.iter_mut().find(|p| p.pid == pid) {
                                proc.cwd = std::path::Path::new(name)
                                    .file_name()
                                    .map(|n| n.to_string_lossy().to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    processes
}

// Windows/Linux: use sysinfo RSS
#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn get_top_processes(limit: usize) -> Vec<ProcessMemory> {
    use sysinfo::System;

    let mut sys = System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    let to_mb = |b: u64| b as f64 / 1_048_576.0;

    let mut processes: Vec<ProcessMemory> = sys
        .processes()
        .iter()
        .map(|(pid, process)| {
            let cwd = process.cwd().and_then(|p| {
                p.file_name().map(|n| n.to_string_lossy().to_string())
            });
            ProcessMemory {
                pid: pid.as_u32(),
                name: process.name().to_string_lossy().to_string(),
                cwd,
                memory_mb: to_mb(process.memory()),
                virtual_mb: to_mb(process.virtual_memory()),
            }
        })
        .collect();

    // Sort by resident memory descending
    processes.sort_by(|a, b| b.memory_mb.partial_cmp(&a.memory_mb).unwrap_or(std::cmp::Ordering::Equal));

    // Return top N
    processes.truncate(limit);
    processes
}

// macOS: get detailed process info via sysinfo + ps + lsof
#[cfg(target_os = "macos")]
#[tauri::command]
fn get_process_details(pid: u32) -> Result<ProcessDetails, String> {
    use sysinfo::{System, Pid, ProcessesToUpdate, ProcessRefreshKind, UpdateKind};
    use std::mem;

    #[repr(C)]
    struct RUsageInfoV4 {
        ri_uuid: [u8; 16],
        ri_user_time: u64,
        ri_system_time: u64,
        ri_pkg_idle_wkups: u64,
        ri_interrupt_wkups: u64,
        ri_pageins: u64,
        ri_wired_size: u64,
        ri_resident_size: u64,
        ri_phys_footprint: u64,
        ri_proc_start_abstime: u64,
        ri_proc_exit_abstime: u64,
        ri_child_user_time: u64,
        ri_child_system_time: u64,
        ri_child_pkg_idle_wkups: u64,
        ri_child_interrupt_wkups: u64,
        ri_child_pageins: u64,
        ri_child_elapsed_abstime: u64,
        ri_diskio_bytesread: u64,
        ri_diskio_byteswritten: u64,
        ri_cpu_time_qos_default: u64,
        ri_cpu_time_qos_maintenance: u64,
        ri_cpu_time_qos_background: u64,
        ri_cpu_time_qos_utility: u64,
        ri_cpu_time_qos_legacy: u64,
        ri_cpu_time_qos_user_initiated: u64,
        ri_cpu_time_qos_user_interactive: u64,
        ri_billed_system_time: u64,
        ri_serviced_system_time: u64,
        ri_logical_writes: u64,
        ri_lifetime_max_phys_footprint: u64,
        ri_instructions: u64,
        ri_cycles: u64,
        ri_billed_energy: u64,
        ri_serviced_energy: u64,
        ri_interval_max_phys_footprint: u64,
        ri_runnable_time: u64,
    }

    extern "C" {
        fn proc_pid_rusage(pid: i32, flavor: i32, buffer: *mut RUsageInfoV4) -> i32;
    }

    const RUSAGE_INFO_V4: i32 = 4;

    let sysinfo_pid = Pid::from_u32(pid);

    // Refresh process info (CPU is fetched separately via ps)
    let mut sys = System::new();
    let refresh_kind = ProcessRefreshKind::new()
        .with_memory()
        .with_exe(UpdateKind::OnlyIfNotSet)
        .with_cwd(UpdateKind::OnlyIfNotSet)
        .with_cmd(UpdateKind::OnlyIfNotSet);

    sys.refresh_processes_specifics(
        ProcessesToUpdate::Some(&[sysinfo_pid]),
        true,
        refresh_kind,
    );

    let process = sys.process(sysinfo_pid)
        .ok_or_else(|| format!("Process {} not found", pid))?;

    let to_mb = |b: u64| b as f64 / 1_048_576.0;

    // Get phys_footprint and disk I/O via proc_pid_rusage
    let mut rusage: RUsageInfoV4 = unsafe { mem::zeroed() };
    let (memory_mb, disk_read, disk_write) = if unsafe { proc_pid_rusage(pid as i32, RUSAGE_INFO_V4, &mut rusage) } == 0 {
        (to_mb(rusage.ri_phys_footprint), rusage.ri_diskio_bytesread, rusage.ri_diskio_byteswritten)
    } else {
        (to_mb(process.memory()), 0, 0)
    };

    // Get user via ps (more reliable on macOS)
    let user = std::process::Command::new("ps")
        .args(["-o", "user=", "-p", &pid.to_string()])
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
                if s.is_empty() { None } else { Some(s) }
            } else {
                None
            }
        });

    // Get full cwd via lsof (more reliable than sysinfo on macOS)
    let cwd = std::process::Command::new("lsof")
        .args(["-d", "cwd", "-a", "-p", &pid.to_string(), "-Fn"])
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                let stdout = String::from_utf8_lossy(&o.stdout);
                for line in stdout.lines() {
                    if let Some(path) = line.strip_prefix('n') {
                        return Some(path.to_string());
                    }
                }
            }
            None
        })
        .or_else(|| process.cwd().map(|p| p.to_string_lossy().to_string()));

    // Status mapping
    let status = match process.status() {
        sysinfo::ProcessStatus::Run => "Running",
        sysinfo::ProcessStatus::Sleep => "Sleeping",
        sysinfo::ProcessStatus::Stop => "Stopped",
        sysinfo::ProcessStatus::Zombie => "Zombie",
        sysinfo::ProcessStatus::Idle => "Idle",
        _ => "Unknown",
    }.to_string();

    // Get cmd args
    let cmd_args: Vec<String> = process.cmd().iter().map(|s| s.to_string_lossy().to_string()).collect();

    Ok(ProcessDetails {
        pid,
        name: process.name().to_string_lossy().to_string(),
        status,
        user,
        parent_pid: process.parent().map(|p| p.as_u32()),
        exe_path: process.exe().map(|p| p.to_string_lossy().to_string()),
        cwd,
        cmd_args,
        start_time: Some(process.start_time()),
        cpu_usage: get_cpu_via_ps(pid),
        memory_mb,
        virtual_mb: to_mb(process.virtual_memory()),
        disk_read_bytes: disk_read,
        disk_write_bytes: disk_write,
    })
}

// macOS: get CPU usage via ps command (more reliable than sysinfo)
#[cfg(target_os = "macos")]
fn get_cpu_via_ps(pid: u32) -> f32 {
    use std::process::Command;

    let output = Command::new("ps")
        .args(["-p", &pid.to_string(), "-o", "%cpu="])
        .output();

    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            stdout.trim().parse::<f32>().unwrap_or(0.0)
        }
        Err(_) => 0.0,
    }
}

// Windows/Linux: get detailed process info via sysinfo
#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn get_process_details(pid: u32) -> Result<ProcessDetails, String> {
    use sysinfo::{System, Pid, ProcessesToUpdate, ProcessRefreshKind, UpdateKind};

    let sysinfo_pid = Pid::from_u32(pid);

    // Create system and do two refreshes with delay for accurate CPU usage
    let mut sys = System::new();
    let refresh_kind = ProcessRefreshKind::new()
        .with_cpu()
        .with_memory()
        .with_disk_usage()
        .with_exe(UpdateKind::OnlyIfNotSet)
        .with_cwd(UpdateKind::OnlyIfNotSet)
        .with_cmd(UpdateKind::OnlyIfNotSet);

    sys.refresh_processes_specifics(
        ProcessesToUpdate::Some(&[sysinfo_pid]),
        true,
        refresh_kind,
    );

    // Small delay for CPU measurement
    std::thread::sleep(std::time::Duration::from_millis(100));

    sys.refresh_processes_specifics(
        ProcessesToUpdate::Some(&[sysinfo_pid]),
        true,
        refresh_kind,
    );

    let process = sys.process(sysinfo_pid)
        .ok_or_else(|| format!("Process {} not found", pid))?;

    let to_mb = |b: u64| b as f64 / 1_048_576.0;

    // Status mapping
    let status = match process.status() {
        sysinfo::ProcessStatus::Run => "Running",
        sysinfo::ProcessStatus::Sleep => "Sleeping",
        sysinfo::ProcessStatus::Stop => "Stopped",
        sysinfo::ProcessStatus::Zombie => "Zombie",
        sysinfo::ProcessStatus::Idle => "Idle",
        _ => "Unknown",
    }.to_string();

    // Get cmd args
    let cmd_args: Vec<String> = process.cmd().iter().map(|s| s.to_string_lossy().to_string()).collect();

    let disk_usage = process.disk_usage();

    Ok(ProcessDetails {
        pid,
        name: process.name().to_string_lossy().to_string(),
        status,
        user: None, // Not easily available via sysinfo on Windows/Linux
        parent_pid: process.parent().map(|p| p.as_u32()),
        exe_path: process.exe().map(|p| p.to_string_lossy().to_string()),
        cwd: process.cwd().map(|p| p.to_string_lossy().to_string()),
        cmd_args,
        start_time: Some(process.start_time()),
        cpu_usage: process.cpu_usage(),
        memory_mb: to_mb(process.memory()),
        virtual_mb: to_mb(process.virtual_memory()),
        disk_read_bytes: disk_usage.read_bytes,
        disk_write_bytes: disk_usage.written_bytes,
    })
}

#[derive(serde::Serialize)]
struct DiskSpaceDetailed {
    total_gb: f64,
    available_gb: f64,              // Real available space (without purgeable on macOS)
    available_with_purgeable_gb: f64, // Available space including purgeable
    purgeable_gb: f64,              // macOS only, 0 on Windows
    used_gb: f64,
}

// Progressive server status step payload
#[derive(Clone, serde::Serialize)]
struct ServerStatusStep {
    step: String,
    data: Option<serde_json::Value>,
}

#[tauri::command]
async fn stream_server_status(app: tauri::AppHandle) -> Result<(), String> {
    use std::io::{BufRead, BufReader};
    use std::process::{Command, Stdio};

    // Emit connecting step
    let _ = app.emit("server-status:step", ServerStatusStep {
        step: "connecting".to_string(),
        data: None,
    });

    // Spawn SSH process
    let child = Command::new("ssh")
        .args(["-o", "ConnectTimeout=10", "ubuntu@51.210.150.25", "/home/ubuntu/server-status.sh"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn SSH: {}", e))?;

    let stdout = child.stdout.ok_or("Failed to capture stdout")?;
    let reader = BufReader::new(stdout);

    for line in reader.lines() {
        let line = line.map_err(|e| format!("Read error: {}", e))?;
        if line.is_empty() {
            continue;
        }

        // Parse the JSON line
        let parsed: serde_json::Value = serde_json::from_str(&line)
            .map_err(|e| format!("JSON parse error: {} for line: {}", e, line))?;

        let step = parsed.get("step")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();

        let data = parsed.get("data").cloned();

        // Emit the step
        let _ = app.emit("server-status:step", ServerStatusStep {
            step,
            data,
        });
    }

    Ok(())
}

// macOS: use df to get accurate free space (sysinfo includes purgeable space)
#[cfg(target_os = "macos")]
#[tauri::command]
fn get_disk_space() -> Result<DiskSpace, String> {
    let output = std::process::Command::new("df")
        .args(["-k", "/"])
        .output()
        .map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let line = stdout.lines().nth(1).ok_or("No df output")?;
    let parts: Vec<&str> = line.split_whitespace().collect();

    let total_kb: f64 = parts.get(1).ok_or("No total")?.parse().map_err(|e: std::num::ParseFloatError| e.to_string())?;
    let available_kb: f64 = parts.get(3).ok_or("No available")?.parse().map_err(|e: std::num::ParseFloatError| e.to_string())?;

    Ok(DiskSpace {
        free_gb: available_kb / 1_048_576.0,
        total_gb: total_kb / 1_048_576.0,
    })
}

// macOS: use Swift to get detailed disk space including purgeable via Foundation API
#[cfg(target_os = "macos")]
#[tauri::command]
fn get_disk_space_detailed() -> Result<DiskSpaceDetailed, String> {
    // Swift one-liner to get volume capacities via Foundation API
    // Returns: total|available|availableForImportantUsage
    let swift_code = r#"
import Foundation
let url = URL(fileURLWithPath: "/")
let values = try! url.resourceValues(forKeys: [.volumeTotalCapacityKey, .volumeAvailableCapacityKey, .volumeAvailableCapacityForImportantUsageKey])
print("\(values.volumeTotalCapacity ?? 0)|\(values.volumeAvailableCapacity ?? 0)|\(values.volumeAvailableCapacityForImportantUsage ?? 0)")
"#;

    let output = std::process::Command::new("swift")
        .args(["-e", swift_code])
        .output()
        .map_err(|e| format!("Failed to run swift: {}", e))?;

    if !output.status.success() {
        return Err(format!("Swift failed: {}", String::from_utf8_lossy(&output.stderr)));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let parts: Vec<&str> = stdout.trim().split('|').collect();

    if parts.len() != 3 {
        return Err(format!("Invalid swift output: {}", stdout));
    }

    let total_bytes: u64 = parts[0].parse().map_err(|_| "Failed to parse total")?;
    let available_bytes: u64 = parts[1].parse().map_err(|_| "Failed to parse available")?;
    let available_with_purgeable_bytes: u64 = parts[2].parse().map_err(|_| "Failed to parse available for important")?;

    let purgeable_bytes = available_with_purgeable_bytes.saturating_sub(available_bytes);
    let used_bytes = total_bytes.saturating_sub(available_with_purgeable_bytes);

    let bytes_to_gb = |b: u64| b as f64 / 1_073_741_824.0;

    Ok(DiskSpaceDetailed {
        total_gb: bytes_to_gb(total_bytes),
        available_gb: bytes_to_gb(available_bytes),
        available_with_purgeable_gb: bytes_to_gb(available_with_purgeable_bytes),
        purgeable_gb: bytes_to_gb(purgeable_bytes),
        used_gb: bytes_to_gb(used_bytes),
    })
}

// Windows/Linux: use sysinfo
#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn get_disk_space() -> Result<DiskSpace, String> {
    let disks = Disks::new_with_refreshed_list();

    let disk = disks
        .iter()
        .find(|d| {
            let mount = d.mount_point().to_string_lossy();
            mount == "/" || mount == "C:\\"
        })
        .or_else(|| disks.iter().next())
        .ok_or("No disk found")?;

    let total_bytes = disk.total_space() as f64;
    let available_bytes = disk.available_space() as f64;

    Ok(DiskSpace {
        free_gb: available_bytes / 1_073_741_824.0,
        total_gb: total_bytes / 1_073_741_824.0,
    })
}

// Windows/Linux: use sysinfo (no purgeable concept)
#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn get_disk_space_detailed() -> Result<DiskSpaceDetailed, String> {
    let disks = Disks::new_with_refreshed_list();

    let disk = disks
        .iter()
        .find(|d| {
            let mount = d.mount_point().to_string_lossy();
            mount == "/" || mount == "C:\\"
        })
        .or_else(|| disks.iter().next())
        .ok_or("No disk found")?;

    let total_bytes = disk.total_space();
    let available_bytes = disk.available_space();
    let used_bytes = total_bytes.saturating_sub(available_bytes);

    let bytes_to_gb = |b: u64| b as f64 / 1_073_741_824.0;

    Ok(DiskSpaceDetailed {
        total_gb: bytes_to_gb(total_bytes),
        available_gb: bytes_to_gb(available_bytes),
        available_with_purgeable_gb: bytes_to_gb(available_bytes), // Same as available on Windows
        purgeable_gb: 0.0, // No purgeable concept on Windows
        used_gb: bytes_to_gb(used_bytes),
    })
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
        .plugin(tauri_plugin_shell::init())
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
                            // Unminimize if minimized, then show and focus
                            let _ = window.unminimize();
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
                            // Unminimize if minimized, then show and focus
                            let _ = window.unminimize();
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
        .invoke_handler(tauri::generate_handler![greet, set_tray_badge, get_disk_space, get_disk_space_detailed, get_memory_info, get_top_processes, get_process_details, stream_server_status])
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
