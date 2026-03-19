import { join } from "node:path";
import { InstallSessionUi, type InstallerUiWriteTarget } from "../install-session-ui.js";
import type { InstallerPlan } from "../../domain/install-plan.js";
import type { InstallerShellPort } from "../ports/installer-shell.port.js";

export interface WriteTarget extends InstallerUiWriteTarget {}

export interface RunInstallSessionOptions {
  shell: InstallerShellPort;
  stdout?: WriteTarget;
  stderr?: WriteTarget;
  env?: NodeJS.ProcessEnv;
}

function renderInstallMethodLabel(method: InstallerPlan["installMethod"]): string {
  return method === "release_asset" ? "packaged release asset" : "source build";
}

function resolveRcHint(shellPath: string | undefined): string {
  if (shellPath?.endsWith("zsh")) {
    return "zsh: ~/.zshrc, bash: ~/.bashrc";
  }
  if (shellPath?.endsWith("bash")) {
    return "bash: ~/.bashrc, zsh: ~/.zshrc";
  }
  return "shell profile: ~/.profile";
}

function pathContainsDir(pathValue: string | undefined, binDir: string): boolean {
  if (!pathValue) {
    return false;
  }
  return pathValue.split(":").includes(binDir);
}

export async function runInstallSession(
  plan: InstallerPlan,
  options: RunInstallSessionOptions,
): Promise<number> {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const env = options.env ?? process.env;
  const ui = new InstallSessionUi(stdout, env);

  try {
    if (env.HERMES_FLY_INSTALLER_SKIP_BANNER !== "1") {
      ui.banner();
    }
    ui.success(`Detected: ${plan.platform}/${plan.arch}`);
    ui.blankLine();
    ui.heading("Install plan");
    ui.keyValue("OS", plan.platform);
    ui.keyValue("Arch", plan.arch);
    ui.keyValue("Install method", renderInstallMethodLabel(plan.installMethod));
    ui.keyValue("Requested version", plan.installRef);
    ui.keyValue("Install to", plan.installHome);
    ui.keyValue("Symlink in", plan.binDir);
    ui.blankLine();

    ui.stage(1, 3, "Preparing environment");
    const nodeVersion = await options.shell.readCommandVersion("node");
    const nodePath = await options.shell.readCommandPath("node");
    const npmVersion = await options.shell.readCommandVersion("npm");
    const npmPath = await options.shell.readCommandPath("npm");
    ui.success(`Node.js ${nodeVersion} found`);
    ui.info(`Active Node.js: ${nodeVersion} (${nodePath})`);
    ui.info(`Active npm: ${npmVersion} (${npmPath})`);
    ui.blankLine();

    ui.stage(2, 3, "Installing Hermes Fly");
    ui.info(`Installing Hermes Fly ${plan.installRef} from ${renderInstallMethodLabel(plan.installMethod)}`);
    const needsSudo = await options.shell.requiresSudo(plan.installHome, plan.binDir);
    if (needsSudo) {
      ui.warn(`Elevated permissions required for ${plan.installHome}`);
    }
    await options.shell.installFiles(plan);
    ui.success("Hermes Fly files installed");
    ui.success("hermes-fly launcher linked");
    ui.blankLine();

    ui.stage(3, 3, "Finalizing setup");
    const binaryPath = join(plan.binDir, "hermes-fly");
    await options.shell.verifyInstalledVersion(binaryPath, plan.installRef);
    const installedVersion = await options.shell.readInstalledVersion(binaryPath);

    if (!pathContainsDir(env.PATH, plan.binDir)) {
      ui.warn(`PATH missing hermes-fly bin dir: ${plan.binDir}`);
      ui.plain("  This can make hermes-fly show as \"command not found\" in new terminals.");
      ui.plain(`  Fix (${resolveRcHint(env.SHELL)}):`);
      ui.plain(`    export PATH="${plan.binDir}:$PATH"`);
      ui.blankLine();
    }

    ui.celebrate(`🪽 Hermes Fly installed successfully (${installedVersion})!`);
    ui.plain("Run 'hermes-fly deploy' to get started.");
    ui.muted("Installation complete. Your deploy wizard just got a little less ceremonial.");
    return 0;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    stderr.write(`Error: ${message}\n`);
    return 1;
  }
}
