import { arch, cpus, freemem, hostname, loadavg, platform, release, totalmem } from "os";
import { APP_NAME, VERSION } from "../version.js";
import { HOME } from "../config.js";
import { getConfig } from "../runtime.js";

export interface SystemUsage {
  cpuPercent: string;
  memoryPercent: string;
}

/**
 * Cross-platform CPU/memory usage via the Node `os` module — works on macOS,
 * Linux and Windows without shelling out to platform-specific tools.
 */
export function readSystemUsage(): SystemUsage {
  let cpuPercent = "unknown";
  let memoryPercent = "unknown";

  try {
    const total = totalmem();
    if (total > 0) {
      const used = total - freemem();
      memoryPercent = ((used / total) * 100).toFixed(1);
    }
  } catch {
    /* keep fallback */
  }

  try {
    // loadavg is 0 on Windows; fall back to "unknown" there.
    const cores = Math.max(1, cpus().length);
    const [oneMin] = loadavg();
    if (oneMin > 0) {
      cpuPercent = Math.min(100, (oneMin / cores) * 100).toFixed(1);
    }
  } catch {
    /* keep fallback */
  }

  return { cpuPercent, memoryPercent };
}

export function toolSystemInfo(): string {
  const usage = readSystemUsage();
  const cfg = getConfig();
  return [
    `app=${APP_NAME}`,
    `version=${VERSION}`,
    `platform=${platform()}`,
    `release=${release()}`,
    `arch=${arch()}`,
    `host=${hostname()}`,
    `home=${HOME}`,
    `roots=${cfg.roots.join(", ")}`,
    `auth=${cfg.token ? "enabled" : "disabled"}`,
    `policy=${cfg.policy}`,
    `log_level=${cfg.logLevel}`,
    `cpu_percent=${usage.cpuPercent}`,
    `memory_percent=${usage.memoryPercent}`,
    `node=${process.version}`,
    `cwd=${process.cwd()}`,
  ].join("\n");
}
