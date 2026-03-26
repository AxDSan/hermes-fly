import type { UpdateRunnerPort } from "../../application/ports/update-runner.port.js";
import type { ForegroundProcessRunner } from "../../../../adapters/process.js";

export class FlyUpdateRunner implements UpdateRunnerPort {
  constructor(
    private readonly runner: ForegroundProcessRunner,
    private readonly env?: NodeJS.ProcessEnv
  ) {}

  async checkAppExists(appName: string): Promise<{ exists: boolean; error?: string }> {
    const result = await this.runner.run(
      "fly",
      ["apps", "list", "--json"],
      { env: this.env }
    );
    if (result.exitCode !== 0) {
      return { 
        exists: false, 
        error: result.stderr?.trim() || `fly apps list failed (exit ${result.exitCode})`
      };
    }
    if (!result.stdout) {
      return { exists: false };
    }

    try {
      const apps = JSON.parse(result.stdout) as Array<{ Name?: string; name?: string }>;
      return { exists: apps.some(app => (app.Name ?? app.name) === appName) };
    } catch {
      return { exists: false };
    }
  }

  async runUpdate(buildDir: string, appName: string): Promise<{ ok: boolean; error?: string }> {
    // For updates, we use fly deploy directly
    // The build context should already have the Dockerfile in place
    if (!buildDir) {
      return { ok: false, error: "build directory is required" };
    }
    const result = await this.runner.runForeground(
      "fly",
      ["deploy", "--app", appName, "--wait-timeout", "5m0s"],
      { env: this.env, cwd: buildDir }
    );

    if (result.exitCode !== 0) {
      return { ok: false, error: "fly deploy failed" };
    }
    return { ok: true };
  }

  async fetchDeployedManifest(appName: string): Promise<{ preinstalledTools?: string[] } | null> {
    // Read deploy-manifest.json from the running machine via SSH
    const result = await this.runner.run(
      "fly",
      ["ssh", "console", "-a", appName, "-C", "cat /root/.hermes/deploy-manifest.json 2>/dev/null || echo '{}'"],
      { env: this.env }
    );
    if (result.exitCode !== 0 || !result.stdout) {
      return null;
    }
    try {
      const manifest = JSON.parse(result.stdout) as { preinstalled_tools?: string; preinstalledTools?: string[] };
      // Handle both snake_case from JSON and camelCase
      const toolsStr = manifest.preinstalled_tools;
      if (toolsStr && typeof toolsStr === "string" && toolsStr.length > 0) {
        return { preinstalledTools: toolsStr.split(",").filter(Boolean) };
      }
      if (manifest.preinstalledTools && Array.isArray(manifest.preinstalledTools)) {
        return { preinstalledTools: manifest.preinstalledTools };
      }
      return {};
    } catch {
      return null;
    }
  }
}
