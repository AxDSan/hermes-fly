import { join } from "node:path";
import type { InstallerPlan } from "../../domain/install-plan.js";
import type { InstallerShellPort } from "../ports/installer-shell.port.js";

export interface WriteTarget {
  write(chunk: string): void;
}

export interface RunInstallSessionOptions {
  shell: InstallerShellPort;
  stdout?: WriteTarget;
  stderr?: WriteTarget;
  env?: NodeJS.ProcessEnv;
}

function writeBanner(stdout: WriteTarget): void {
  stdout.write("  🪽 Hermes Fly Installer\n");
  stdout.write("  I can't fix Fly.io billing, but I can fix the part between curl and deploy.\n\n");
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

  try {
    writeBanner(stdout);
    stdout.write(`✓ Detected: ${plan.platform}/${plan.arch}\n\n`);
    stdout.write("Install plan\n");
    stdout.write(`OS: ${plan.platform}\n`);
    stdout.write(`Arch: ${plan.arch}\n`);
    stdout.write(`Install method: ${renderInstallMethodLabel(plan.installMethod)}\n`);
    stdout.write(`Requested version: ${plan.installRef}\n`);
    stdout.write(`Install to: ${plan.installHome}\n`);
    stdout.write(`Symlink in: ${plan.binDir}\n\n`);

    stdout.write("[1/3] Preparing environment\n");
    const nodeVersion = await options.shell.readCommandVersion("node");
    const nodePath = await options.shell.readCommandPath("node");
    const npmVersion = await options.shell.readCommandVersion("npm");
    const npmPath = await options.shell.readCommandPath("npm");
    stdout.write(`✓ Node.js ${nodeVersion} found\n`);
    stdout.write(`· Active Node.js: ${nodeVersion} (${nodePath})\n`);
    stdout.write(`· Active npm: ${npmVersion} (${npmPath})\n\n`);

    stdout.write("[2/3] Installing Hermes Fly\n");
    stdout.write(`· Installing hermes-fly ${plan.installRef} from ${renderInstallMethodLabel(plan.installMethod)}\n`);
    const needsSudo = await options.shell.requiresSudo(plan.installHome, plan.binDir);
    if (needsSudo) {
      stdout.write(`! Elevated permissions required for ${plan.installHome}\n`);
    }
    await options.shell.installFiles(plan);
    stdout.write("✓ Hermes Fly files installed\n");
    stdout.write("✓ hermes-fly launcher linked\n\n");

    stdout.write("[3/3] Finalizing setup\n");
    const binaryPath = join(plan.binDir, "hermes-fly");
    await options.shell.verifyInstalledVersion(binaryPath, plan.installRef);
    const installedVersion = await options.shell.readInstalledVersion(binaryPath);

    if (!pathContainsDir(env.PATH, plan.binDir)) {
      stdout.write(`! PATH missing installer bin dir: ${plan.binDir}\n`);
      stdout.write("  This can make hermes-fly show as \"command not found\" in new terminals.\n");
      stdout.write(`  Fix (${resolveRcHint(env.SHELL)}):\n`);
      stdout.write(`    export PATH="${plan.binDir}:$PATH"\n\n`);
    }

    stdout.write(`🪽 hermes-fly installed successfully (${installedVersion})!\n`);
    stdout.write("Run 'hermes-fly deploy' to get started.\n");
    stdout.write("Installation complete. Your deploy wizard just got a little less ceremonial.\n");
    return 0;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    stderr.write(`Error: ${message}\n`);
    return 1;
  }
}
