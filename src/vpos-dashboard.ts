import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import {
  CpuInfo,
  DirectoryUsage,
  DiskInfo,
  LoadInfo,
  MemoryInfo,
  ProcessInfo,
  SwapInfo,
  SystemStats,
  TemperatureInfo,
  TemperatureSensor,
} from "./interfaces";
import { HumanizeKB } from "./snippets/humanSize";
import { getContentType } from "./snippets/getContentType";

const execAsync = promisify(exec);

const fsp = fs.promises;

const PORT = Number(process.env.PORT) || 8000;

const getHostname = async (): Promise<string> => {
  const { stdout } = await execAsync("hostname");
  return stdout.trim();
};

const getMemory = async (): Promise<{ memory: MemoryInfo; swap: SwapInfo }> => {
  const { stdout } = await execAsync("free -m");
  const lines = stdout.trim().split("\n");
  const memLine = lines.find((l) => l.toLowerCase().startsWith("mem:"));
  const swapLine = lines.find((l) => l.toLowerCase().startsWith("swap:"));
  if (!memLine || !swapLine) {
    throw new Error("Unexpected 'free -m' output");
  }

  const parseNums = (line: string): number[] =>
    line
      .split(/\s+/)
      .slice(1)
      .map((x) => Number(x));

  const [memTotal, memUsed, memFree] = parseNums(memLine);
  const [swapTotal, swapUsed, swapFree] = parseNums(swapLine);

  const memory: MemoryInfo = {
    total: memTotal,
    used: memUsed,
    free: memFree,
    usedPercent: memTotal ? (memUsed * 100) / memTotal : 0,
  };

  const swap: SwapInfo = {
    total: swapTotal,
    used: swapUsed,
    free: swapFree,
    usedPercent: swapTotal ? (swapUsed * 100) / swapTotal : 0,
  };

  return { memory, swap };
};

const getDisks = async (): Promise<DiskInfo[]> => {
  const { stdout } = await execAsync("df -k");
  const lines = stdout.trim().split("\n");
  if (lines.length <= 1) return [];
  const [, ...rows] = lines;

  const disks: DiskInfo[] = [];

  for (const line of rows) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 6) continue;
    const [filesystem, blocksStr, usedStr, availStr, usePercent, mountpoint] =
      parts;

    const sizeKB = Number(blocksStr);
    const usedKB = Number(usedStr);
    const availKB = Number(availStr);
    if (!Number.isFinite(sizeKB)) continue;

    disks.push({
      filesystem,
      sizeKB,
      usedKB,
      availKB,
      size: HumanizeKB(sizeKB),
      used: HumanizeKB(usedKB),
      avail: HumanizeKB(availKB),
      usePercent,
      mountpoint,
    });
  }

  // Prefer /media/appfs if present
  const appfs = disks.filter((d) => d.mountpoint === "/media/appfs");
  return appfs.length ? appfs : disks;
};

const getLoad = async (): Promise<LoadInfo> => {
  const { stdout } = await execAsync("uptime");
  const match = stdout.match(
    /load average:\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)/,
  );
  if (!match) throw new Error("Unexpected 'uptime' output");
  const [, one, five, fifteen] = match;
  return {
    one: Number(one),
    five: Number(five),
    fifteen: Number(fifteen),
  };
};

// BusyBox: "PID USER VSZ STAT COMMAND"
const getTopProcesses = async (limit = 5): Promise<ProcessInfo[]> => {
  try {
    const { stdout } = await execAsync("ps");
    const lines = stdout.trim().split("\n");
    if (lines.length <= 1) return [];
    const [, ...rows] = lines;

    const procs: ProcessInfo[] = [];
    for (const line of rows) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 5) continue;
      const [pidStr, user, vszStr, stat, ...cmdParts] = parts;
      const pid = Number(pidStr);
      const vsz = Number(vszStr);
      if (!Number.isFinite(pid) || !Number.isFinite(vsz)) continue;
      procs.push({
        pid,
        user,
        vsz,
        stat,
        command: cmdParts.join(" "),
      });
    }
    procs.sort((a, b) => b.vsz - a.vsz);
    return procs.slice(0, limit);
  } catch (err) {
    console.error("Error getting top processes:", err);
    return [];
  }
};

// /proc/stat CPU usage
let prevCpuSample: { idle: number; total: number } | null = null;

const getCpu = async (): Promise<CpuInfo> => {
  try {
    const text = await fsp.readFile("/proc/stat", "utf8");
    const firstLine = text.split("\n")[0]; // cpu  ...
    const parts = firstLine.trim().split(/\s+/);
    if (parts[0] !== "cpu") throw new Error("Unexpected /proc/stat format");
    const nums = parts.slice(1).map((n) => Number(n));
    if (nums.length < 4) throw new Error("Not enough CPU fields");

    const idle = nums[3] + (nums[4] || 0); // idle + iowait
    const total = nums.reduce((sum, n) => sum + n, 0);

    if (!prevCpuSample) {
      prevCpuSample = { idle, total };
      return { usagePercent: null };
    }

    const idleDelta = idle - prevCpuSample.idle;
    const totalDelta = total - prevCpuSample.total;
    prevCpuSample = { idle, total };

    if (totalDelta <= 0) return { usagePercent: null };

    const usage = ((totalDelta - idleDelta) / totalDelta) * 100;
    return { usagePercent: usage };
  } catch (err) {
    console.error("Error reading CPU usage:", err);
    return { usagePercent: null };
  }
};

// /sys/class/thermal/thermal_zoneX/temp
const getTemperatures = async (): Promise<TemperatureInfo> => {
  const base = "/sys/class/thermal";
  const sensors: TemperatureSensor[] = [];

  try {
    const zones = await fsp.readdir(base);
    for (const name of zones) {
      if (!name.startsWith("thermal_zone")) continue;
      const zonePath = path.join(base, name);
      try {
        const type = await fsp.readFile(path.join(zonePath, "type"), "utf8");
        const tempRaw = await fsp.readFile(path.join(zonePath, "temp"), "utf8");
        const label = type.trim() || name;
        let val = Number(tempRaw.trim());
        if (!Number.isFinite(val)) continue;
        if (val > 1000) val = val / 1000; // milli-deg to deg
        sensors.push({ name: label, tempC: val });
      } catch {
        // ignore this zone
      }
    }
  } catch (err) {
    console.error("Error reading thermal zones:", err);
  }

  const averageTempC =
    sensors.length > 0
      ? sensors.reduce((sum, s) => sum + s.tempC, 0) / sensors.length
      : null;

  return { sensors, averageTempC };
};

// Single directory usage
const getDirectoryUsage = async (
  targetPath: string,
): Promise<DirectoryUsage> => {
  const safe = targetPath.replace(/"/g, '\\"');
  const { stdout } = await execAsync(`du -sk "${safe}"`);
  const [sizeStr] = stdout.trim().split(/\s+/);
  const usedKB = Number(sizeStr);
  if (!Number.isFinite(usedKB)) {
    throw new Error("Unexpected 'du -sk' output");
  }
  return {
    path: targetPath,
    usedKB,
    usedHuman: HumanizeKB(usedKB),
  };
};

// Subdirectories of /opt/fccapps/vpos-perm
const getTrackedDirectories = async (): Promise<DirectoryUsage[]> => {
  const baseDir = "/opt/fccapps/vpos-perm";
  const tracked: DirectoryUsage[] = [];

  let entries: fs.Dirent[];
  try {
    entries = await fsp.readdir(baseDir, { withFileTypes: true });
  } catch (err) {
    console.error(`Error reading base directory ${baseDir}:`, err);
    return [];
  }

  const subdirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => path.join(baseDir, e.name));

  for (const dirPath of subdirs) {
    try {
      const du = await getDirectoryUsage(dirPath);
      tracked.push(du);
    } catch (err) {
      console.error(`Error getting usage for ${dirPath}:`, err);
    }
  }

  tracked.sort((a, b) => b.usedKB - a.usedKB);
  return tracked;
};

// Generic "dir-usage" for a chosen directory (limited to /opt/fccapps and /media/appfs)
const getDirectoryChildrenUsage = async (
  baseDir: string,
): Promise<DirectoryUsage[]> => {
  const ALLOWED_ROOTS = ["/opt/fccapps", "/media/appfs"];
  const resolved = path.resolve(baseDir);

  if (!ALLOWED_ROOTS.some((root) => resolved.startsWith(root))) {
    throw new Error("Path not allowed");
  }

  let entries: fs.Dirent[];
  try {
    entries = await fsp.readdir(baseDir, { withFileTypes: true });
  } catch (err) {
    console.error(`Error reading directory ${baseDir}:`, err);
    return [];
  }

  const subdirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => path.join(baseDir, e.name));

  const results: DirectoryUsage[] = [];
  for (const dirPath of subdirs) {
    try {
      const du = await getDirectoryUsage(dirPath);
      results.push(du);
    } catch (err) {
      console.error(`Error du for ${dirPath}:`, err);
    }
  }

  results.sort((a, b) => b.usedKB - a.usedKB);
  return results;
};

const getStats = async (): Promise<SystemStats> => {
  const [
    hostname,
    { memory, swap },
    disks,
    load,
    processes,
    directories,
    cpu,
    temperatures,
  ] = await Promise.all([
    getHostname(),
    getMemory(),
    getDisks(),
    getLoad(),
    getTopProcesses(5),
    getTrackedDirectories(),
    getCpu(),
    getTemperatures(),
  ]);

  return {
    hostname,
    timestamp: Date.now(),
    memory,
    swap,
    disks,
    load,
    processes,
    directories,
    cpu,
    temperatures,
  };
};

/* ---------- HTTP server / routing ---------- */
const publicDir = path.resolve(__dirname, "../public");

const server = http.createServer(
  async (req: http.IncomingMessage, res: http.ServerResponse) => {
    try {
      const rawUrl = req.url || "/";
      const urlObj = new URL(rawUrl, "http://localhost");
      const pathname = urlObj.pathname;

      // API: /api/stats
      if (pathname === "/api/stats") {
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }
        try {
          const stats = await getStats();
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(stats));
        } catch (err) {
          console.error("Error getting stats:", err);
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Failed to get stats" }));
        }
        return;
      }

      // API: /api/dir-usage?path=...
      if (pathname === "/api/dir-usage") {
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }
        const basePath = urlObj.searchParams.get("path");
        if (!basePath) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Missing path" }));
          return;
        }
        try {
          const dirs = await getDirectoryChildrenUsage(basePath);
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(dirs));
        } catch (err) {
          console.error("Error in dir-usage:", err);
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Failed to get dir usage" }));
        }
        return;
      }

      // Static files
      let filePath = pathname === "/" ? "/index.html" : pathname;
      filePath = filePath.split("?")[0].split("#")[0];
      const fullPath = path.join(publicDir, filePath);

      if (!fullPath.startsWith(publicDir)) {
        res.statusCode = 400;
        res.end("Bad request");
        return;
      }

      fs.stat(fullPath, (err, stats) => {
        if (err || !stats.isFile()) {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }
        const stream = fs.createReadStream(fullPath);
        res.statusCode = 200;
        res.setHeader("Content-Type", getContentType(fullPath));
        stream.pipe(res);
      });
    } catch (err) {
      console.error("Request error:", err);
      res.statusCode = 500;
      res.end("Internal server error");
    }
  },
);

server.listen(PORT, () => {
  console.log(`Dashboard listening on http://localhost:${PORT}`);
});
