export interface MemoryInfo {
  total: number;
  used: number;
  free: number;
  usedPercent: number;
}

export interface SwapInfo {
  total: number;
  used: number;
  free: number;
  usedPercent: number;
}

export interface DiskInfo {
  filesystem: string;
  size: string;
  used: string;
  avail: string;
  usePercent: string;
  mountpoint: string;

  sizeKB: number;
  usedKB: number;
  availKB: number;
}

export interface LoadInfo {
  one: number;
  five: number;
  fifteen: number;
}

export interface ProcessInfo {
  pid: number;
  user: string;
  vsz: number; // KiB
  stat: string;
  command: string;
}

export interface DirectoryUsage {
  path: string;
  usedKB: number;
  usedHuman: string;
}

export interface CpuInfo {
  usagePercent: number | null;
}

export interface TemperatureSensor {
  name: string;
  tempC: number;
}

export interface TemperatureInfo {
  sensors: TemperatureSensor[];
  averageTempC: number | null;
}

export interface SystemStats {
  hostname: string;
  timestamp: number;
  memory: MemoryInfo;
  swap: SwapInfo;
  disks: DiskInfo[];
  load: LoadInfo;
  processes: ProcessInfo[];
  directories: DirectoryUsage[];
  cpu: CpuInfo;
  temperatures: TemperatureInfo;
}

export type Theme = "light" | "dark";
export type Density = "comfortable" | "compact";
