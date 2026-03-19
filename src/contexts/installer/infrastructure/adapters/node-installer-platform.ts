import { accessSync, constants, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { NodeProcessRunner } from "../../../../adapters/process.js";
import type { ForegroundProcessRunner, ProcessRunner } from "../../../../adapters/process.js";
import type { InstallChannel, InstallerPlan } from "../../domain/install-plan.js";
import type { InstallerBootstrapPort, PreparedInstallSource } from "../../application/ports/installer-shell.port.js";

const REPO = "alexfazio/hermes-fly";
const SAFE_PROCESS_LOCALE = "C";
const RELEASE_TAG = /^v(\d+)\.(\d+)\.(\d+)$/;

function normalizeInstallRef(ref: string): string {
  const trimmed = ref.trim();
  if (/^\d+\.\d+\.\d+$/.test(trimmed)) {
    return `v${trimmed}`;
  }
  return trimmed;
}

function isReleaseRef(ref: string): boolean {
  return RELEASE_TAG.test(ref);
}

function compareReleaseTags(left: string, right: string): number {
  const leftMatch = RELEASE_TAG.exec(left);
  const rightMatch = RELEASE_TAG.exec(right);
  if (!leftMatch || !rightMatch) {
    return left.localeCompare(right);
  }

  for (let index = 1; index <= 3; index += 1) {
    const delta = Number(leftMatch[index]) - Number(rightMatch[index]);
    if (delta !== 0) {
      return delta;
    }
  }

  return 0;
}

function releaseAssetName(installRef: string): string {
  return `hermes-fly-${installRef}.tar.gz`;
}

function sourceArchiveUrl(installRef: string): string {
  return `https://codeload.github.com/${REPO}/tar.gz/${installRef}`;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "hermes-fly-installer",
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed for ${url} (${response.status})`);
  }

  return await response.json();
}

async function downloadToFile(url: string, filePath: string): Promise<void> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/octet-stream",
      "User-Agent": "hermes-fly-installer",
    },
  });

  if (!response.ok) {
    throw new Error(`Download failed for ${url} (${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  writeFileSync(filePath, Buffer.from(arrayBuffer));
}

export class NodeInstallerPlatform implements InstallerBootstrapPort {
  constructor(
    private readonly runner: ProcessRunner = new NodeProcessRunner(),
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  async readCommandVersion(command: "node" | "npm"): Promise<string> {
    if (command === "node") {
      return process.version;
    }

    const result = await this.runner.run(command, ["--version"]);
    if (result.exitCode !== 0) {
      throw new Error(`Unable to read ${command} version`);
    }
    return result.stdout.trim().split(/\r?\n/, 1)[0] ?? "";
  }

  async readCommandPath(command: string): Promise<string> {
    if (command === "node") {
      return process.execPath;
    }

    const result = await this.runner.run("/bin/bash", ["-lc", `command -v ${command}`]);
    if (result.exitCode !== 0) {
      throw new Error(`Unable to resolve ${command} on PATH`);
    }
    return result.stdout.trim().split(/\r?\n/, 1)[0] ?? "";
  }

  async requiresSudo(installHome: string, binDir: string): Promise<boolean> {
    return this.needsSudo(installHome) || this.needsSudo(binDir);
  }

  async installFiles(plan: InstallerPlan): Promise<void> {
    const useSudo = await this.requiresSudo(plan.installHome, plan.binDir);
    if (useSudo && !(await this.commandExists("sudo"))) {
      throw new Error(
        `Cannot write to ${plan.installHome} and sudo is not available\nTry: HERMES_FLY_INSTALL_DIR=~/.local/bin HERMES_FLY_HOME=~/.local/lib/hermes-fly bash install.sh`,
      );
    }

    await this.runMaybeSudo(useSudo, "mkdir", ["-p", plan.installHome], true);
    await this.runMaybeSudo(useSudo, "rm", ["-rf", join(plan.installHome, "dist"), join(plan.installHome, "node_modules"), join(plan.installHome, "templates"), join(plan.installHome, "data")], true);
    await this.runMaybeSudo(useSudo, "rm", ["-f", join(plan.installHome, "hermes-fly"), join(plan.installHome, "package.json"), join(plan.installHome, "package-lock.json")], true);
    await this.runMaybeSudo(useSudo, "cp", [join(plan.sourceDir, "hermes-fly"), plan.installHome], true);
    await this.runMaybeSudo(useSudo, "chmod", ["+x", join(plan.installHome, "hermes-fly")], true);

    await this.copyDirIfPresent(useSudo, join(plan.sourceDir, "templates"), plan.installHome);
    await this.copyDirIfPresent(useSudo, join(plan.sourceDir, "data"), plan.installHome);
    await this.copyDirIfPresent(useSudo, join(plan.sourceDir, "dist"), plan.installHome);
    await this.copyFileIfPresent(useSudo, join(plan.sourceDir, "package.json"), plan.installHome);
    await this.copyFileIfPresent(useSudo, join(plan.sourceDir, "package-lock.json"), plan.installHome);
    await this.copyDirIfPresent(useSudo, join(plan.sourceDir, "node_modules"), plan.installHome);

    await this.runMaybeSudo(useSudo, "mkdir", ["-p", plan.binDir], true);
    await this.runMaybeSudo(useSudo, "ln", ["-sf", join(plan.installHome, "hermes-fly"), join(plan.binDir, "hermes-fly")], true);
  }

  async verifyInstalledVersion(binaryPath: string, installRef: string): Promise<void> {
    if (!isReleaseRef(installRef)) {
      return;
    }

    const versionOutput = await this.readInstalledVersion(binaryPath);
    const actual = /hermes-fly\s+(\d+\.\d+\.\d+)/.exec(versionOutput)?.[1];
    const expected = installRef.slice(1);

    if (!actual) {
      throw new Error(`Could not determine installed hermes-fly version\n${versionOutput}`);
    }
    if (actual !== expected) {
      throw new Error(`Installed version mismatch\nRequested release: ${installRef}\nInstalled version: ${actual}`);
    }
  }

  async readInstalledVersion(binaryPath: string): Promise<string> {
    const result = await this.runner.run(binaryPath, ["--version"]);
    const combined = `${result.stdout}${result.stderr}`.trim();
    if (result.exitCode !== 0 && combined.length === 0) {
      throw new Error("Unable to read installed hermes-fly version");
    }
    return combined.split(/\r?\n/, 1)[0] ?? combined;
  }

  async resolveInstallRef(channel: InstallChannel, requestedVersion?: string): Promise<string> {
    if (requestedVersion && requestedVersion.trim().length > 0) {
      return normalizeInstallRef(requestedVersion);
    }

    switch (channel) {
      case "edge":
        return "main";
      case "latest":
      case "stable":
      case "preview":
        return await this.resolveLatestReleaseTag();
    }
  }

  async prepareInstallSource(installRef: string): Promise<PreparedInstallSource> {
    const tmpRoot = mkdtempSync(join(tmpdir(), "hermes-fly-install-"));
    const sourceDir = join(tmpRoot, "hermes-fly");
    const cleanup = (): void => {
      rmSync(tmpRoot, { recursive: true, force: true });
    };

    try {
      const assetUrl = await this.resolveReleaseAssetUrl(installRef);
      if (assetUrl) {
        await this.downloadReleaseAsset(assetUrl, sourceDir);
        return {
          sourceDir,
          installMethod: "release_asset",
          cleanup,
        };
      }

      await this.downloadSourceTree(installRef, sourceDir);
      return {
        sourceDir,
        installMethod: "source_build",
        cleanup,
      };
    } catch (error) {
      cleanup();
      throw error;
    }
  }

  async ensureRuntimeArtifacts(sourceDir: string): Promise<void> {
    if (existsSync(join(sourceDir, "dist", "cli.js")) && existsSync(join(sourceDir, "node_modules", "commander", "package.json"))) {
      return;
    }

    if (!existsSync(join(sourceDir, "package.json")) || !existsSync(join(sourceDir, "package-lock.json"))) {
      throw new Error("package.json and package-lock.json are required to build hermes-fly from source");
    }

    const env = {
      ...this.env,
      LANG: SAFE_PROCESS_LOCALE,
      LC_ALL: SAFE_PROCESS_LOCALE,
      BASH_ENV: "",
      ENV: "",
    };

    for (const args of [
      ["ci", "--no-audit", "--no-fund"],
      ["run", "build"],
      ["prune", "--omit=dev", "--no-audit", "--no-fund"],
    ]) {
      const result = await this.runner.run("npm", args, { cwd: sourceDir, env });
      if (result.exitCode !== 0) {
        throw new Error("Failed to prepare hermes-fly runtime artifacts");
      }
    }

    if (!existsSync(join(sourceDir, "dist", "cli.js"))) {
      throw new Error("Build completed without dist/cli.js");
    }
    if (!existsSync(join(sourceDir, "node_modules", "commander", "package.json"))) {
      throw new Error("Runtime dependency commander was not installed");
    }
  }

  private async resolveLatestReleaseTag(): Promise<string> {
    const apiUrl = this.env.HERMES_FLY_RELEASE_API_URL ?? `https://api.github.com/repos/${REPO}/releases/latest`;

    try {
      const data = await fetchJson(apiUrl);
      if (typeof data === "object" && data !== null && "tag_name" in data && typeof data.tag_name === "string") {
        return data.tag_name;
      }
    } catch {
      // Git fallback below.
    }

    const result = await this.runner.run("git", ["ls-remote", "--refs", "--tags", `https://github.com/${REPO}.git`]);
    if (result.exitCode !== 0) {
      throw new Error("Could not determine the latest hermes-fly release");
    }

    const tags = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim().split(/\s+/).at(-1) ?? "")
      .map((ref) => ref.replace(/^refs\/tags\//, ""))
      .filter((tag) => isReleaseRef(tag))
      .sort(compareReleaseTags);

    const latest = tags.at(-1);
    if (!latest) {
      throw new Error("Could not determine the latest hermes-fly release");
    }
    return latest;
  }

  private async resolveReleaseAssetUrl(installRef: string): Promise<string | null> {
    if (!isReleaseRef(installRef)) {
      return null;
    }

    try {
      const data = await fetchJson(`https://api.github.com/repos/${REPO}/releases/tags/${installRef}`);
      if (!data || typeof data !== "object" || !("assets" in data) || !Array.isArray(data.assets)) {
        return null;
      }

      const asset = data.assets.find((item) => {
        if (!item || typeof item !== "object") {
          return false;
        }
        return "browser_download_url" in item
          && typeof item.browser_download_url === "string"
          && item.browser_download_url.endsWith(`/${releaseAssetName(installRef)}`);
      });

      if (!asset || typeof asset !== "object" || typeof asset.browser_download_url !== "string") {
        return null;
      }
      return asset.browser_download_url;
    } catch {
      return null;
    }
  }

  private async downloadReleaseAsset(assetUrl: string, extractDir: string): Promise<void> {
    if (!(await this.commandExists("tar"))) {
      throw new Error("tar is required to extract hermes-fly release assets");
    }

    mkdirSync(extractDir, { recursive: true });
    const archivePath = join(extractDir, basename(assetUrl));
    await downloadToFile(assetUrl, archivePath);

    const result = await this.runner.run("tar", ["-xzf", archivePath, "-C", extractDir]);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to extract release asset: ${archivePath}`);
    }

    if (!existsSync(join(extractDir, "hermes-fly"))) {
      throw new Error("Release asset did not contain hermes-fly launcher");
    }
  }

  private async downloadSourceTree(installRef: string, destDir: string): Promise<void> {
    const archivePath = `${destDir}.tar.gz`;
    const extractRoot = `${destDir}.extract`;
    rmSync(destDir, { recursive: true, force: true });
    rmSync(extractRoot, { recursive: true, force: true });
    mkdirSync(extractRoot, { recursive: true });

    try {
      await downloadToFile(sourceArchiveUrl(installRef), archivePath);
      const tarResult = await this.runner.run("tar", ["-xzf", archivePath, "-C", extractRoot]);
      if (tarResult.exitCode === 0) {
        const extractedRoot = this.findSingleDirectory(extractRoot);
        if (extractedRoot) {
          cpSync(extractedRoot, destDir, { recursive: true });
          return;
        }
      }
    } catch {
      // Git fallback below.
    } finally {
      rmSync(extractRoot, { recursive: true, force: true });
      rmSync(archivePath, { force: true });
      if (existsSync(destDir) && this.isEmptyDirectory(destDir)) {
        rmSync(destDir, { recursive: true, force: true });
      }
    }

    const cloneResult = await this.runner.run(
      "git",
      ["clone", "--depth", "1", "--branch", installRef, "--single-branch", `https://github.com/${REPO}.git`, destDir],
    );
    if (cloneResult.exitCode !== 0) {
      throw new Error("Download failed");
    }
  }

  private findSingleDirectory(root: string): string | null {
    const entries = readdirSync(root, { withFileTypes: true });
    const firstDir = entries.find((entry) => entry.isDirectory());
    return firstDir ? join(root, firstDir.name) : null;
  }

  private isEmptyDirectory(root: string): boolean {
    return readdirSync(root).length === 0;
  }

  private needsSudo(targetPath: string): boolean {
    const pathToCheck = existsSync(targetPath) ? targetPath : dirname(targetPath);
    try {
      accessSync(pathToCheck, constants.W_OK);
      return false;
    } catch {
      return true;
    }
  }

  private async copyDirIfPresent(useSudo: boolean, sourceDir: string, targetRoot: string): Promise<void> {
    if (!existsSync(sourceDir)) {
      return;
    }
    await this.runMaybeSudo(useSudo, "cp", ["-R", sourceDir, targetRoot], true);
  }

  private async copyFileIfPresent(useSudo: boolean, sourceFile: string, targetRoot: string): Promise<void> {
    if (!existsSync(sourceFile)) {
      return;
    }
    await this.runMaybeSudo(useSudo, "cp", [sourceFile, targetRoot], true);
  }

  private async commandExists(command: string): Promise<boolean> {
    const result = await this.runner.run("/bin/bash", ["-lc", `command -v ${command} >/dev/null 2>&1`]);
    return result.exitCode === 0;
  }

  private async runMaybeSudo(
    useSudo: boolean,
    command: string,
    args: string[],
    foreground: boolean,
  ): Promise<void> {
    const fullCommand = useSudo ? "sudo" : command;
    const fullArgs = useSudo ? [command, ...args] : args;

    if (foreground && this.isForegroundRunner(this.runner)) {
      const result = await this.runner.runForeground(fullCommand, fullArgs);
      if (result.exitCode !== 0) {
        throw new Error(`Command failed: ${fullCommand} ${fullArgs.join(" ")}`);
      }
      return;
    }

    const result = await this.runner.run(fullCommand, fullArgs);
    if (result.exitCode !== 0) {
      throw new Error(`Command failed: ${fullCommand} ${fullArgs.join(" ")}`);
    }
  }

  private isForegroundRunner(runner: ProcessRunner): runner is ForegroundProcessRunner {
    return "runForeground" in runner;
  }
}
