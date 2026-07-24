import { cpus, freemem, totalmem } from "os";

let lastSample: { idle: number; total: number } | null = null;

/**
 * Sample CPU and memory usage locally (the CLI runs on the same machine as the
 * server). CPU percent is derived from the delta between successive calls, so
 * the first reading returns 0 until a baseline exists.
 */
export function readSystemUsage(): { cpuPercent: number; memoryPercent: number } {
  const cores = cpus();
  let idle = 0;
  let total = 0;
  for (const core of cores) {
    for (const value of Object.values(core.times)) total += value;
    idle += core.times.idle;
  }

  let cpuPercent = 0;
  if (lastSample) {
    const idleDiff = idle - lastSample.idle;
    const totalDiff = total - lastSample.total;
    cpuPercent = totalDiff > 0 ? Math.round((1 - idleDiff / totalDiff) * 100) : 0;
  }
  lastSample = { idle, total };

  const memoryPercent = totalmem() > 0 ? Math.round((1 - freemem() / totalmem()) * 100) : 0;
  return {
    cpuPercent: Math.max(0, Math.min(100, cpuPercent)),
    memoryPercent: Math.max(0, Math.min(100, memoryPercent)),
  };
}
