/**
 * downloader.ts — locate or download the platform-matching `pypilot` helper
 * binary, mirroring the logic in the Zed WASM shim.
 *
 * Resolution order:
 *  1. `pypilot` on $PATH (if the version is new enough)
 *  2. A previously-downloaded binary in the extension's global storage
 *  3. Download the latest release asset from GitHub
 */

import * as fs from 'fs';
import * as https from 'https';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

const HELPER_REPO = 'Abdullah-Masood-05/pypilot';
const MIN_VERSION: [number, number, number] = [0, 1, 0];

export interface HelperInfo {
  path: string;
  version: string;
  managed: boolean;
}

/**
 * Ensure a working `pypilot` binary exists and return its path.
 * Shows a VS Code progress notification while downloading if needed.
 */
export async function ensureHelper(
  context: vscode.ExtensionContext
): Promise<HelperInfo> {
  // 1. Check PATH.
  const onPath = which('pypilot');
  if (onPath) {
    const ver = await probeVersion(onPath);
    if (ver && compareVersions(ver, MIN_VERSION) >= 0) {
      return { path: onPath, version: fmtVersion(ver), managed: false };
    }
  }

  // 2. Reuse a previously-downloaded binary.
  const managed = managedPath(context);
  if (managed && fs.existsSync(managed)) {
    const ver = await probeVersion(managed);
    if (ver && compareVersions(ver, MIN_VERSION) >= 0) {
      return { path: managed, version: fmtVersion(ver), managed: true };
    }
    // Stale binary — fall through to re-download.
    fs.rmSync(managed, { force: true });
  }

  // 3. Download.
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'PyPilot',
      cancellable: false,
    },
    async (progress) => {
      progress.report({ message: 'Downloading helper binary…' });
      const binPath = await downloadHelper(context);
      const ver = await probeVersion(binPath);
      return {
        path: binPath,
        version: ver ? fmtVersion(ver) : 'unknown',
        managed: true,
      };
    }
  );
}

// --- internals ---------------------------------------------------------------

function managedPath(context: vscode.ExtensionContext): string | undefined {
  const dir = context.globalStorageUri.fsPath;
  const name = process.platform === 'win32' ? 'pypilot.exe' : 'pypilot';
  return path.join(dir, 'bin', name);
}

async function downloadHelper(
  context: vscode.ExtensionContext
): Promise<string> {
  const asset = assetForPlatform();
  const releaseUrl = `https://api.github.com/repos/${HELPER_REPO}/releases/latest`;

  const release = await fetchJson<GithubRelease>(releaseUrl);
  const assetEntry = release.assets.find((a) => a.name === asset.fileName);
  if (!assetEntry) {
    throw new Error(
      `No PyPilot helper asset "${asset.fileName}" found in the latest release.`
    );
  }

  const dir = path.join(context.globalStorageUri.fsPath, 'bin');
  fs.mkdirSync(dir, { recursive: true });

  const archive = path.join(dir, asset.fileName);
  await downloadFile(assetEntry.browser_download_url, archive);

  const binName = process.platform === 'win32' ? 'pypilot.exe' : 'pypilot';
  const binPath = path.join(dir, binName);

  await extractArchive(archive, dir, asset.fileName);
  fs.rmSync(archive, { force: true });

  if (process.platform !== 'win32') {
    fs.chmodSync(binPath, 0o755);
  }

  return binPath;
}

function assetForPlatform(): { fileName: string } {
  const { platform, arch } = process;
  let slug: string;

  if (platform === 'linux' && arch === 'x64') {
    slug = 'linux-x64';
  } else if (platform === 'linux' && arch === 'arm64') {
    slug = 'linux-arm64';
  } else if (platform === 'darwin' && arch === 'x64') {
    slug = 'darwin-x64';
  } else if (platform === 'darwin' && arch === 'arm64') {
    slug = 'darwin-arm64';
  } else if (platform === 'win32' && arch === 'x64') {
    slug = 'windows-x64';
  } else {
    throw new Error(`Unsupported platform for PyPilot helper: ${platform}/${arch}`);
  }

  const ext = platform === 'win32' ? 'zip' : 'tar.gz';
  return { fileName: `pypilot-${slug}.${ext}` };
}

/** Probe `<path> --version` and return parsed semver, or undefined. */
async function probeVersion(
  binPath: string
): Promise<[number, number, number] | undefined> {
  try {
    const { execFileSync } = require('child_process');
    const out = execFileSync(binPath, ['--version'], { encoding: 'utf8', timeout: 5000 });
    return parseVersion(out.trim());
  } catch {
    return undefined;
  }
}

function parseVersion(out: string): [number, number, number] | undefined {
  // "pypilot 0.1.0"
  const m = out.match(/pypilot\s+(\d+)\.(\d+)\.(\d+)/);
  if (!m) return undefined;
  return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])];
}

function fmtVersion([ma, mi, pa]: [number, number, number]): string {
  return `${ma}.${mi}.${pa}`;
}

function compareVersions(
  a: [number, number, number],
  b: [number, number, number]
): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/** Cross-platform `which`. */
function which(name: string): string | undefined {
  try {
    const { execFileSync } = require('child_process');
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    const out = execFileSync(cmd, [name], { encoding: 'utf8', timeout: 3000 });
    const found = out.trim().split(/\r?\n/)[0];
    if (found) return found;
  } catch {
    // Continue to standard fallback
  }

  // Fallback: check ~/.cargo/bin in case PATH was not inherited by VS Code GUI
  const homedir = os.homedir();
  const binName = process.platform === 'win32' ? `${name}.exe` : name;
  const cargoBin = path.join(homedir, '.cargo', 'bin', binName);
  if (fs.existsSync(cargoBin)) {
    return cargoBin;
  }

  return undefined;
}

function fetchJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'pypilot-vscode',
        Accept: 'application/vnd.github+json',
      },
    };
    https.get(url, options, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const follow = (u: string) =>
      https.get(u, { headers: { 'User-Agent': 'pypilot-vscode' } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          follow(res.headers.location!);
          return;
        }
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
      }).on('error', reject);
    follow(url);
  });
}

async function extractArchive(archive: string, dest: string, fileName: string): Promise<void> {
  const { execFileSync } = require('child_process');
  if (fileName.endsWith('.zip')) {
    if (process.platform === 'win32') {
      // PowerShell Expand-Archive (always available on Windows 5+)
      execFileSync(
        'powershell.exe',
        ['-NoProfile', '-Command', `Expand-Archive -Path '${archive}' -DestinationPath '${dest}' -Force`],
        { timeout: 30000 }
      );
    } else {
      execFileSync('unzip', ['-o', archive, '-d', dest], { timeout: 30000 });
    }
  } else {
    // .tar.gz — available on Linux/macOS; also on Windows via Git Bash / WSL
    execFileSync('tar', ['-xzf', archive, '-C', dest], { timeout: 30000 });
  }
}

// --- GitHub API types --------------------------------------------------------

interface GithubRelease {
  tag_name: string;
  assets: GithubAsset[];
}

interface GithubAsset {
  name: string;
  browser_download_url: string;
}
