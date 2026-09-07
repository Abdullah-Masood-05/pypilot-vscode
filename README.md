# PyPilot for VS Code

> Sets up Python environments, resolves version/hardware compatibility, and rescues newcomers from dependency hell — **no AI, no API keys, near-zero latency.**

Identical engine to [PyPilot for Zed](https://github.com/Abdullah-Masood-05/pypilot), now with VS Code-native surfaces: command palette, status bar, progress spinners, interactive report panel, and integrated tasks.

---

## Features

| What | How |
|---|---|
| **Automatic environment setup** | `uv init` + `uv add` when no `pyproject.toml` exists; `pip freeze > requirements.txt` in pip mode |
| **Python version resolution** | Reads wheel tags + `requires_python` from PyPI; picks the Python all dependencies agree on |
| **Hardware / CUDA matching** | Detects NVIDIA driver, maps it to the right `torch`/`tensorflow` CUDA build |
| **Live import diagnostics** | Red squiggles on `import mediapipe` if mediapipe has no wheel for your Python — with one-click fix |
| **Workspace onboarding** | On open: silent scan → VS Code popup with **Fix Everything / Show Details / Ignore** |
| **Status bar** | `🐍 3.12 ✓` when healthy · `⚠ Fix` when broken · clickable |
| **Command palette** | All actions via `Ctrl+Shift+P` → `PyPilot:…` |
| **Integrated tasks** | `Tasks: Run Task` → `PyPilot: Set Up Environment`, `Doctor`, `Fix Python Version`, etc. |
| **Interactive report panel** | Doctor output as rich HTML with color-coded finding cards and action buttons |

---

## Requirements

- VS Code 1.85 or later
- Internet access on first install (to download the `pypilot` helper binary — ~3 MB, once)
- No Python pre-install required in `uv` mode — PyPilot fetches the right Python for you

---

## Getting Started

1. Open a Python project folder in VS Code
2. PyPilot auto-activates and scans the workspace
3. If something is wrong you get a popup — click **Fix Everything**
4. Done. The environment is now on the Python version your dependencies actually support

---

## Commands

| Command | Description |
|---|---|
| `PyPilot: Set Up Environment` | Full bootstrap: uv → correct Python → venv → deps |
| `PyPilot: Doctor — Show Environment Report` | Read-only scan; opens the interactive report panel |
| `PyPilot: Fix Python Version` | Recomputes the intersection, rebuilds the venv |
| `PyPilot: Fix CUDA / PyTorch Build` | Re-pins torch/TF to the build matching your driver |
| `PyPilot: Check Package Compatibility…` | Input box → compatibility report for one package |
| `PyPilot: Install Package…` | Input box → install + record in pyproject.toml |
| `PyPilot: Update Bundled Data Tables` | Force-refresh NVIDIA/framework/import-map JSONs |
| `PyPilot: Migrate Conda environment.yml → pyproject.toml` | Translates your conda env |

---

## Settings

| Setting | Default | Description |
|---|---|---|
| `pypilot.packageManager` | `"uv"` | `"uv"` or `"pip"`. uv mode never requires a prior install. |
| `pypilot.notifications` | `"problems-only"` | `"all"`, `"problems-only"`, or `"off"` |
| `pypilot.autoCheckOnOpen` | `true` | Run workspace scan when a folder is opened |
| `pypilot.dataRefreshDays` | `7` | TTL for bundled table refresh; `0` = fully offline |

---

## Architecture

The extension is a thin TypeScript shim (like the Zed WASM shim). All real logic lives in the native `pypilot` helper binary (Rust), which the extension downloads on first run from GitHub Releases. The helper speaks stdio LSP; this extension is a standard `vscode-languageclient` wrapper around it.

```
pypilot-vscode/
├── src/
│   ├── extension.ts        ← activation, LanguageClient, onboarding
│   ├── downloader.ts       ← locate / download the helper binary
│   ├── statusBar.ts        ← status bar item
│   ├── commands.ts         ← command palette handlers
│   ├── tasks.ts            ← TaskProvider (pypilot type)
│   └── webview/
│       └── reportPanel.ts  ← interactive HTML doctor report
├── build.ts                ← Bun-native build script
├── bunfig.toml
└── package.json
```

---

## Development

```bash
# Install dependencies (uses Bun)
bun install

# Build once
bun run build

# Watch mode
bun run build --watch

# Package as .vsix
bun run package
```

---

## License

AGPLv3 — same as the helper binary. See [LICENSE](../pypilot/LICENSE).
