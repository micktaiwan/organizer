import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { InfoPanel, InfoSection } from "./ui/InfoPanel";
import "./ProcessDetailsPanel.css";

interface ProcessDetails {
  pid: number;
  name: string;
  status: string;
  user: string | null;
  parent_pid: number | null;
  exe_path: string | null;
  cwd: string | null;
  cmd_args: string[];
  start_time: number | null;
  cpu_usage: number;
  memory_mb: number;
  virtual_mb: number;
  disk_read_bytes: number;
  disk_write_bytes: number;
}

interface Ancestor {
  pid: number;
  name: string;
}

interface ProcessDetailsPanelProps {
  pid: number;
  onClose: () => void;
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
};

const formatMemory = (mb: number): string => {
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(2)} GB`;
  }
  return `${mb.toFixed(1)} MB`;
};

const formatUptime = (startTime: number): string => {
  const now = Math.floor(Date.now() / 1000);
  const seconds = now - startTime;

  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  }
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  return `${d}d ${h}h`;
};

const MAX_CPU_HISTORY = 200; // ~100 seconds at 500ms refresh

interface CpuSparklineProps {
  history: number[];
}

const CpuSparkline = ({ history }: CpuSparklineProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // Draw bars from right to left (newest on right)
    const barWidth = 1;
    const startX = width - history.length * barWidth;

    history.forEach((value, i) => {
      const barHeight = (value / 100) * height;
      const x = startX + i * barWidth;

      // Color based on value
      if (value > 80) ctx.fillStyle = "#f44336";
      else if (value > 50) ctx.fillStyle = "#FF9800";
      else ctx.fillStyle = "#2196F3";

      ctx.fillRect(x, height - barHeight, barWidth, barHeight);
    });
  }, [history]);

  return <canvas ref={canvasRef} className="cpu-sparkline" width={400} height={80} />;
};

export function ProcessDetailsPanel({ pid, onClose }: ProcessDetailsPanelProps) {
  const [currentPid, setCurrentPid] = useState(pid);
  const [details, setDetails] = useState<ProcessDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ancestors, setAncestors] = useState<Ancestor[]>([]);
  const [processGone, setProcessGone] = useState(false);
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);

  // Sync currentPid with prop pid when it changes (clicking another process)
  useEffect(() => {
    setCurrentPid(pid);
    setCpuHistory([]); // Reset history when switching processes
  }, [pid]);

  // Fetch ancestors recursively
  const fetchAncestors = useCallback(async (parentPid: number | null, chain: Ancestor[]): Promise<Ancestor[]> => {
    if (parentPid === null || parentPid === 0) {
      return chain;
    }

    try {
      const parentDetails = await invoke<ProcessDetails>("get_process_details", { pid: parentPid });
      chain.unshift({ pid: parentDetails.pid, name: parentDetails.name });

      // Stop recursion if parent_pid is same as pid (kernel) or null
      if (parentDetails.parent_pid !== null && parentDetails.parent_pid !== parentDetails.pid) {
        return fetchAncestors(parentDetails.parent_pid, chain);
      }
    } catch {
      // Parent process might have exited or be inaccessible
      // Add a placeholder for known system processes
      if (parentPid === 1) {
        chain.unshift({ pid: 1, name: "launchd" });
      }
    }

    return chain;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const fetchDetails = async (isInitial: boolean) => {
      try {
        if (isInitial) {
          setLoading(true);
          setError(null);
          setProcessGone(false);
        }
        const data = await invoke<ProcessDetails>("get_process_details", { pid: currentPid });
        if (!cancelled) {
          setDetails(data);

          // Update CPU history
          setCpuHistory(prev => {
            const next = [...prev, data.cpu_usage];
            return next.length > MAX_CPU_HISTORY ? next.slice(-MAX_CPU_HISTORY) : next;
          });

          // Fetch ancestors only on initial load
          if (isInitial) {
            if (data.parent_pid !== null && data.parent_pid !== data.pid) {
              const ancestorChain = await fetchAncestors(data.parent_pid, []);
              if (!cancelled) {
                setAncestors(ancestorChain);
              }
            } else {
              setAncestors([]);
            }
            setLoading(false);
          }
        }
      } catch (err) {
        if (!cancelled) {
          if (isInitial) {
            setError(err instanceof Error ? err.message : String(err));
            setLoading(false);
          } else {
            // Process was killed during refresh
            setProcessGone(true);
            if (intervalId) {
              clearInterval(intervalId);
              intervalId = null;
            }
          }
        }
      }
    };

    fetchDetails(true);

    // Refresh CPU/memory every 500ms
    intervalId = setInterval(() => fetchDetails(false), 500);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [currentPid, fetchAncestors]);

  // Navigate to an ancestor
  const navigateToProcess = (targetPid: number) => {
    setCurrentPid(targetPid);
  };

  const buildSections = (): InfoSection[] => {
    if (!details) return [];

    const sections: InfoSection[] = [];

    // Identity section
    sections.push({
      title: "Identity",
      items: [
        { label: "PID", value: String(details.pid), mono: true },
        { label: "Name", value: details.name },
        { label: "Status", value: details.status, highlight: details.status === "Running" ? "green" : details.status === "Zombie" ? "red" : undefined },
        ...(details.user ? [{ label: "User", value: details.user }] : []),
        ...(details.parent_pid ? [{ label: "Parent PID", value: String(details.parent_pid), mono: true }] : []),
      ],
    });

    // Paths section
    const pathItems = [];
    if (details.exe_path) {
      pathItems.push({ label: "Executable", value: details.exe_path, mono: true });
    }
    if (details.cwd) {
      pathItems.push({ label: "Working Dir", value: details.cwd, mono: true });
    }
    if (details.cmd_args.length > 0) {
      // Show first few args, truncate if too many
      const argsDisplay = details.cmd_args.length > 5
        ? details.cmd_args.slice(0, 5).join(" ") + ` ... (+${details.cmd_args.length - 5} more)`
        : details.cmd_args.join(" ");
      pathItems.push({ label: "Arguments", value: argsDisplay, mono: true });
    }
    if (pathItems.length > 0) {
      sections.push({ title: "Paths", items: pathItems });
    }

    // Performance section
    sections.push({
      title: "Performance",
      headerContent: <CpuSparkline history={cpuHistory} />,
      items: [
        { label: "CPU", value: `${details.cpu_usage.toFixed(1)}%`, highlight: details.cpu_usage > 80 ? "red" : details.cpu_usage > 50 ? "orange" : "blue" },
        { label: "Memory", value: formatMemory(details.memory_mb), highlight: details.memory_mb > 1024 ? "orange" : undefined },
        { label: "Virtual", value: formatMemory(details.virtual_mb) },
        { label: "Disk Read", value: formatBytes(details.disk_read_bytes) },
        { label: "Disk Write", value: formatBytes(details.disk_write_bytes) },
      ],
    });

    // Timing section
    if (details.start_time) {
      const startDate = new Date(details.start_time * 1000);
      sections.push({
        title: "Timing",
        items: [
          { label: "Started", value: startDate.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) },
          { label: "Uptime", value: formatUptime(details.start_time), highlight: "green" },
        ],
      });
    }

    return sections;
  };

  // Build header content (ancestor chain + process gone banner)
  const renderHeaderContent = () => {
    if (!details) return null;
    return (
      <>
        {processGone && (
          <div className="process-gone-banner">Process terminé</div>
        )}
        <div className="process-ancestor-chain">
          {ancestors.map((ancestor) => (
            <span key={ancestor.pid} className="process-ancestor">
              <button
                className="process-ancestor-link"
                onClick={() => navigateToProcess(ancestor.pid)}
                title={`PID ${ancestor.pid}`}
              >
                {ancestor.name}
              </button>
              <span className="process-ancestor-arrow">→</span>
            </span>
          ))}
          <span className="process-ancestor current">
            <strong>{details.name}</strong>
            <span className="process-ancestor-pid">({details.pid})</span>
          </span>
        </div>
      </>
    );
  };

  return (
    <InfoPanel
      title={details ? `Process: ${details.name}` : `Process ${currentPid}`}
      sections={buildSections()}
      onClose={onClose}
      loading={loading}
      error={error || undefined}
      className="process-details-panel"
      headerContent={!loading && !error ? renderHeaderContent() : undefined}
    />
  );
}
