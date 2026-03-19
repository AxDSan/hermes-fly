import { Command } from "commander";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NodeInstallerPlatform } from "./contexts/installer/infrastructure/adapters/node-installer-platform.js";
import { InstallerPlan, type InstallChannel, type InstallMethod } from "./contexts/installer/domain/install-plan.js";
import { runInstallSession } from "./contexts/installer/application/use-cases/run-install-session.js";
import type { InstallerBootstrapPort } from "./contexts/installer/application/ports/installer-shell.port.js";

export interface InstallCommandInput {
  platform?: string;
  arch?: string;
  installChannel?: InstallChannel;
  installMethod?: InstallMethod;
  installRef?: string;
  installHome?: string;
  binDir?: string;
  sourceDir?: string;
  version?: string;
}

export type InstallCommandHandler = (input: InstallCommandInput) => Promise<number>;

function detectPlatform(): string {
  switch (process.platform) {
    case "darwin":
      return "darwin";
    case "linux":
      return "linux";
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
}

function detectArch(): string {
  switch (process.arch) {
    case "x64":
      return "amd64";
    case "arm64":
      return "arm64";
    default:
      throw new Error(`Unsupported architecture: ${process.arch}`);
  }
}

function resolveInstallChannel(channel?: string): InstallChannel {
  const resolved = channel?.trim() || process.env.HERMES_FLY_CHANNEL?.trim() || "latest";
  switch (resolved) {
    case "latest":
    case "stable":
    case "preview":
    case "edge":
      return resolved;
    default:
      return "latest";
  }
}

function resolveInstallHome(explicit?: string): string {
  return explicit?.trim() || process.env.HERMES_FLY_HOME?.trim() || "/usr/local/lib/hermes-fly";
}

function resolveBinDir(explicit?: string): string {
  return explicit?.trim() || process.env.HERMES_FLY_INSTALL_DIR?.trim() || "/usr/local/bin";
}

export async function runInstallCommand(
  input: InstallCommandInput,
  shell: InstallerBootstrapPort = new NodeInstallerPlatform(),
  sessionRunner: typeof runInstallSession = runInstallSession,
): Promise<number> {
  const installChannel = input.installChannel ?? resolveInstallChannel();
  const installRef = input.installRef ?? (await shell.resolveInstallRef(installChannel, input.version ?? process.env.HERMES_FLY_VERSION));
  const preparedSource = await shell.prepareInstallSource(installRef);

  try {
    await shell.ensureRuntimeArtifacts(preparedSource.sourceDir);
    const plan = InstallerPlan.create({
      platform: input.platform ?? detectPlatform(),
      arch: input.arch ?? detectArch(),
      installChannel,
      installMethod: input.installMethod ?? preparedSource.installMethod,
      installRef,
      installHome: resolveInstallHome(input.installHome),
      binDir: resolveBinDir(input.binDir),
      sourceDir: input.sourceDir ?? preparedSource.sourceDir,
    });

    return await sessionRunner(plan, { shell });
  } finally {
    preparedSource.cleanup();
  }
}

export function buildInstallerProgram(runInstall: InstallCommandHandler = async (input) => await runInstallCommand(input)): Command {
  const program = new Command()
    .name("hermes-fly-installer")
    .description("Hermes Fly installer")
    .helpOption("-h, --help", "Show help");

  program
    .command("install")
    .description("Install Hermes Fly")
    .option("--platform <platform>", "Override detected platform")
    .option("--arch <arch>", "Override detected architecture")
    .option("--channel <channel>", "Install channel")
    .option("--method <method>", "Internal install method override")
    .option("--ref <ref>", "Resolved install ref override")
    .option("--version <version>", "Requested version override")
    .option("--install-home <path>", "Install home override")
    .option("--bin-dir <path>", "Binary directory override")
    .option("--source-dir <path>", "Prepared source directory override")
    .action(async (opts: Record<string, string | undefined>) => {
      process.exitCode = await runInstall({
        platform: opts.platform,
        arch: opts.arch,
        installChannel: opts.channel as InstallChannel | undefined,
        installMethod: opts.method as InstallMethod | undefined,
        installRef: opts.ref,
        installHome: opts.installHome,
        binDir: opts.binDir,
        sourceDir: opts.sourceDir,
        version: opts.version,
      });
    });

  return program;
}

export async function runInstaller(argv: string[]): Promise<void> {
  const program = buildInstallerProgram();

  if (argv.length <= 2) {
    await program.parseAsync(["install"], { from: "user" });
    return;
  }

  await program.parseAsync(argv);
}

export function isInstallerEntrypoint(importMetaUrl: string, argv1?: string): boolean {
  if (!argv1) {
    return false;
  }

  try {
    return realpathSync(fileURLToPath(importMetaUrl)) === realpathSync(argv1);
  } catch {
    return fileURLToPath(importMetaUrl) === argv1;
  }
}

if (isInstallerEntrypoint(import.meta.url, process.argv[1])) {
  runInstaller(process.argv).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Installer error: ${message}\n`);
    process.exitCode = 1;
  });
}
