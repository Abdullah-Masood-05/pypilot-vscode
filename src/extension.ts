/**
 * extension.ts — PyPilot VS Code extension entry point.
 *
 * Activation:
 *   1. Locate / download the `pypilot` helper binary (downloader.ts).
 *   2. Start the language client (LanguageClient wrapping `pypilot lsp`).
 *   3. Register the status bar item.
 *   4. Register all command palette handlers.
 *   5. Register the task provider.
 *   6. On workspace open: if auto-check is on, run a silent scan and surface
 *      any findings via a VS Code-native popup with action buttons.
 *
 * Deactivation: stop the language client (cleans up the language server process).
 */

import * as vscode from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

import { ensureHelper } from "./downloader";
import { PyPilotStatusBar } from "./statusBar";
import { registerCommands } from "./commands";
import { PyPilotTaskProvider } from "./tasks";
import { ReportPanel } from "./webview/reportPanel";

let client: LanguageClient | undefined;
let statusBar: PyPilotStatusBar | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // ── 1. Resolve the helper binary ─────────────────────────────────────────
  let helperPath: string;
  try {
    const info = await ensureHelper(context);
    helperPath = info.path;
    console.log(`PyPilot: using helper ${info.path} v${info.version} (managed=${info.managed})`);
  } catch (err) {
    vscode.window.showErrorMessage(
      `PyPilot: could not locate the helper binary. ${err}\n` +
        "Install `pypilot` manually and ensure it is on your PATH, or check your internet connection."
    );
    return;
  }

  // ── 2. Status bar ─────────────────────────────────────────────────────────
  statusBar = new PyPilotStatusBar();
  context.subscriptions.push({ dispose: () => statusBar?.dispose() });

  // ── 3. Language client ────────────────────────────────────────────────────
  const serverOptions: ServerOptions = {
    command: helperPath,
    args: ["lsp"],
    transport: TransportKind.stdio,
  };

  const clientOptions: LanguageClientOptions = {
    // Activate for Python files and the manifest formats PyPilot understands.
    documentSelector: [
      { scheme: "file", language: "python" },
      { scheme: "file", pattern: "**/requirements.txt" },
      { scheme: "file", pattern: "**/pyproject.toml" },
      { scheme: "file", pattern: "**/environment.yml" },
    ],
    synchronize: {
      fileEvents: vscode.workspace.createFileSystemWatcher(
        "**/{requirements.txt,pyproject.toml,environment.yml,*.py}"
      ),
    },
    outputChannelName: "PyPilot",
  };

  client = new LanguageClient(
    "pypilot",
    "PyPilot",
    serverOptions,
    clientOptions
  );

  // Update the status bar once the server is ready.
  // In vscode-languageclient v9, start() returns Promise<void> (not Disposable),
  // and onReady() was removed. Use start() directly for readiness.
  client.start().then(() => {
    statusBar?.setStatus("ok");
  }).catch(() => {
    statusBar?.setStatus("error", "LSP failed to start");
  });

  context.subscriptions.push({ dispose: () => client?.stop() });

  // ── 4. Commands ───────────────────────────────────────────────────────────
  registerCommands(context, client, statusBar);

  // ── 5. Task provider ──────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.tasks.registerTaskProvider(
      PyPilotTaskProvider.taskType,
      new PyPilotTaskProvider()
    )
  );

  // ── 6. Workspace onboarding ───────────────────────────────────────────────
  const cfg = vscode.workspace.getConfiguration("pypilot");
  if (cfg.get<boolean>("autoCheckOnOpen", true)) {
    // Delay slightly so the LSP server has time to start and run its first scan.
    setTimeout(() => runOnboardingCheck(context), 3000);
  }
}

export async function deactivate(): Promise<void> {
  await client?.stop();
}

// ---------------------------------------------------------------------------
// Workspace onboarding popup (VS Code equivalent of the Zed F5 toast)
// ---------------------------------------------------------------------------

async function runOnboardingCheck(context: vscode.ExtensionContext): Promise<void> {
  if (!client) return;

  const notifications = vscode.workspace
    .getConfiguration("pypilot")
    .get<string>("notifications", "problems-only");

  if (notifications === "off") return;

  // The LSP server handles the actual scan and will send us a
  // showMessageRequest if there's anything to report. The middleware above
  // intercepts it and shows a VS Code-native popup. No extra work needed here
  // for the default flow.
  //
  // If the user chose "all" notifications, also register a command to open
  // the report panel immediately on any informational finding.
  if (notifications === "all") {
    context.subscriptions.push(
      vscode.commands.registerCommand("pypilot._openReportInternal", () => {
        ReportPanel.show(context);
      })
    );
  }
}
