import os from "os";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

/**
 * Lightweight in-file .env loader that does not depend on external packages.
 */
function loadEnvFile(envPath: string): void {
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, "");
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

// Automatically locate repository root and load server/.env
const repoRootCandidate = fs.existsSync(path.join(process.cwd(), "server", ".env"))
  ? process.cwd()
  : path.resolve(process.cwd(), "..");
const serverEnvPath = path.join(repoRootCandidate, "server", ".env");
loadEnvFile(serverEnvPath);

export interface SystemInfo {
  timestamp: string;
  gitCommit: string;
  nodeVersion: string;
  os: {
    platform: string;
    type: string;
    release: string;
    arch: string;
  };
  cpu: {
    model: string;
    cores: number;
    speedMhz: number;
  };
  ram: {
    totalGb: number;
    freeGb: number;
  };
  command: string;
}

/**
 * Enforces Hard Rule #1:
 * - Refuse to run if NODE_ENV=production
 * - Refuse to run if target URL is not localhost/127.0.0.1 (unless --allow-remote is provided)
 */
export function enforceEnvironmentGuard(targetUrl?: string): void {
  const nodeEnv = process.env.NODE_ENV || "development";
  if (nodeEnv.toLowerCase() === "production") {
    console.error("❌ Refusing to run benchmark: NODE_ENV=production. Benchmark scripts are forbidden in production.");
    process.exit(1);
  }

  if (targetUrl) {
    const isAllowRemote = process.argv.includes("--allow-remote");
    const parsed = new URL(targetUrl);
    const isLocal =
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "::1" ||
      parsed.hostname === "0.0.0.0";

    if (!isLocal && !isAllowRemote) {
      console.error(
        `❌ Refusing to run benchmark against non-local target '${targetUrl}'. Pass --allow-remote to explicitly override.`
      );
      process.exit(1);
    }
  }
}

/**
 * Gathers system hardware, OS, git, and execution metadata for raw benchmark reporting.
 */
export function getSystemInfo(): SystemInfo {
  let gitCommit = "unknown";
  try {
    gitCommit = execSync("git rev-parse HEAD", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    // Git might not be in PATH or shallow checkout
  }

  const cpus = os.cpus();
  const cpuModel = cpus.length > 0 ? cpus[0].model : "unknown";
  const cpuSpeed = cpus.length > 0 ? cpus[0].speed : 0;
  const totalGb = parseFloat((os.totalmem() / (1024 ** 3)).toFixed(2));
  const freeGb = parseFloat((os.freemem() / (1024 ** 3)).toFixed(2));

  return {
    timestamp: new Date().toISOString(),
    gitCommit,
    nodeVersion: process.version,
    os: {
      platform: os.platform(),
      type: os.type(),
      release: os.release(),
      arch: os.arch(),
    },
    cpu: {
      model: cpuModel,
      cores: cpus.length,
      speedMhz: cpuSpeed,
    },
    ram: {
      totalGb,
      freeGb,
    },
    command: `${process.argv0} ${process.argv.slice(1).join(" ")}`,
  };
}

/**
 * Resolves repository root regardless of current working directory.
 */
export function getRepoRoot(): string {
  // If cwd has scripts/bench, cwd is root
  if (fs.existsSync(path.join(process.cwd(), "scripts", "bench"))) {
    return process.cwd();
  }
  // If parent has scripts/bench, parent is root
  const parent = path.dirname(process.cwd());
  if (fs.existsSync(path.join(parent, "scripts", "bench"))) {
    return parent;
  }
  // Default fallback to cwd
  return process.cwd();
}

/**
 * Saves a benchmark output object into docs/results-raw/<filename>.json
 */
export function saveRawResult(filename: string, data: unknown): string {
  const repoRoot = getRepoRoot();
  const resultsDir = path.join(repoRoot, "docs", "results-raw");
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  const filePath = path.join(resultsDir, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  return filePath;
}
