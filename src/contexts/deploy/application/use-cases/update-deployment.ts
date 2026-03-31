import type { UpdateRunnerPort } from "../ports/update-runner.port.js";
import type { DeployWizardPort, ExistingAppConfig } from "../ports/deploy-wizard.port.js";

const HERMES_AGENT_DEFAULT_REF = "8eefbef91cd715cfe410bba8c13cfab4eb3040df";
const HERMES_AGENT_EDGE_REF = "main";
const HERMES_AGENT_REPO = "NousResearch/hermes-agent";

interface GitHubRelease {
  tag_name: string;
  target_commitish: string;
  name: string;
  published_at: string;
}

// Cache for latest release to avoid multiple API calls
let latestReleaseCache: { ref: string; tag: string; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export type UpdateResult =
  | { kind: "ok" }
  | { kind: "failed"; error: string };

export interface UpdateConfig {
  appName: string;
  channel: "stable" | "preview" | "edge";
}

export class UpdateDeploymentUseCase {
  constructor(
    private readonly runner: UpdateRunnerPort,
    private readonly wizard: DeployWizardPort,
    private readonly env: NodeJS.ProcessEnv = process.env
  ) {}

  async execute(
    config: UpdateConfig,
    stderr: { write: (s: string) => void },
    stdout: { write: (s: string) => void }
  ): Promise<UpdateResult> {
    // Phase 1: Pre-flight checks
    const platformResult = await this.wizard.checkPlatform();
    if (!platformResult.ok) {
      stderr.write(`[error] Platform check failed: ${platformResult.error ?? "unsupported platform"}\n`);
      return { kind: "failed", error: platformResult.error ?? "unsupported platform" };
    }

    const prereqResult = await this.wizard.checkPrerequisites({ autoInstall: true });
    if (!prereqResult.ok) {
      if (prereqResult.autoInstallDisabled) {
        stderr.write(`[error] '${prereqResult.missing ?? "fly"}' not found (auto-install disabled).\n`);
      } else if (prereqResult.error) {
        stderr.write(`[error] ${prereqResult.error}\n`);
      } else {
        stderr.write(`[error] Missing prerequisite: ${prereqResult.missing ?? "unknown"}\n`);
      }
      return { kind: "failed", error: `Missing prerequisite: ${prereqResult.missing}` };
    }

    const authResult = await this.wizard.checkAuth();
    if (!authResult.ok) {
      stderr.write(`[error] Not authenticated. Run: fly auth login\n`);
      return { kind: "failed", error: authResult.error ?? "not authenticated" };
    }

    // Phase 2: Verify app exists
    const appCheck = await this.runner.checkAppExists(config.appName);
    if (appCheck.error) {
      stderr.write(`[error] Failed to check app existence: ${appCheck.error}\n`);
      return { kind: "failed", error: `fly apps list failed: ${appCheck.error}` };
    }
    if (!appCheck.exists) {
      stderr.write(`[error] App '${config.appName}' not found. Run 'hermes-fly deploy' to create it.\n`);
      return { kind: "failed", error: "app not found" };
    }

    // Phase 3: Fetch existing config and prompt for choice
    stdout.write(`Updating '${config.appName}' to ${config.channel} channel...\n`);
    const hermesRef = await this.resolveHermesRef(config.channel, stderr);

    // Fetch preinstalledTools from deployed manifest
    const manifest = await this.runner.fetchDeployedManifest(config.appName);
    const existingTools = manifest?.preinstalledTools ?? [];
    
    // Show debug info if there were issues fetching the manifest
    if (manifest?.error) {
      stderr.write(`[warn] Could not read installed tools: ${manifest.error}\n`);
    }
    
    if (existingTools.length > 0) {
      stdout.write(`  Currently installed tools: ${existingTools.join(", ")}\n`);
    } else if (!manifest?.error) {
      stdout.write(`  No additional tools currently installed.\n`);
    }

    // Allow modifying tools during update
    const preinstalledTools = await this.wizard.promptUpdateToolsChoice(existingTools);

    const existingConfig = await this.wizard.fetchExistingConfig(config.appName);
    let deployConfig: ExistingAppConfig;

    if (existingConfig) {
      const choice = await this.wizard.promptUpdateConfigChoice(existingConfig);
      if (choice.keep) {
        deployConfig = existingConfig;
      } else if (choice.config) {
        deployConfig = {
          region: choice.config.region,
          vmSize: choice.config.vmSize,
          volumeSize: choice.config.volumeSize,
        };
      } else {
        deployConfig = existingConfig;
      }
    } else {
      // Could not fetch config, use defaults
      stderr.write(`[warn] Could not fetch existing config, using defaults.\n`);
      deployConfig = {
        region: "iad",
        vmSize: "shared-cpu-2x",
        volumeSize: 1,
      };
    }

    // Phase 4: Generate update Dockerfile
    let buildDir: string;
    try {
      const result = await this.wizard.createBuildContext(
        {
          orgSlug: "",
          appName: config.appName,
          region: deployConfig.region,
          vmSize: deployConfig.vmSize,
          volumeSize: deployConfig.volumeSize,
          provider: "",
          apiKey: "",
          model: "",
          hermesRef,
          botToken: "",
          channel: config.channel,
          preinstalledTools,
        },
        { update: true }
      );
      buildDir = result.buildDir;
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to create build context";
      stderr.write(`[error] ${message}\n`);
      return { kind: "failed", error: message };
    }

    // Phase 5: Run update (skip provisioning - app and volume already exist)
    stdout.write(`Building and deploying update...\n`);
    const updateResult = await this.runner.runUpdate(buildDir, config.appName);
    if (!updateResult.ok) {
      stderr.write(`[error] Update failed: ${updateResult.error ?? "unknown error"}\n`);
      return { kind: "failed", error: updateResult.error ?? "update failed" };
    }

    // Phase 5.5: Update the tools secret so future updates remember this selection
    stdout.write(`Persisting tool selection...\n`);
    const secretResult = await this.wizard.updateToolSecret(config.appName, preinstalledTools);
    if (!secretResult.ok) {
      stderr.write(`[warn] Could not save tool selection for future updates: ${secretResult.error ?? "unknown error"}\n`);
      stderr.write(`[warn] Your tools are installed, but future updates may not remember this selection.\n`);
    } else if (preinstalledTools.length > 0) {
      stdout.write(`  Tool selection saved: ${preinstalledTools.join(", ")}\n`);
    }

    // Phase 6: Post-update check
    const checkResult = await this.wizard.postDeployCheck(config.appName);
    if (!checkResult.ok) {
      stderr.write(`[warn] Post-update check failed. App may still be starting up.\n`);
      stderr.write(`Tip: run 'hermes-fly status -a ${config.appName}' to check.\n`);
    }

    stdout.write(`\n✓ '${config.appName}' updated successfully to ${config.channel} channel.\n`);
    stdout.write(`  Channel: ${config.channel}\n`);
    stdout.write(`  Ref: ${hermesRef.slice(0, 8)}...${hermesRef.slice(-8)}\n`);
    stdout.write(`\nNext steps:\n`);
    stdout.write(`  - Check status:  hermes-fly status -a ${config.appName}\n`);
    stdout.write(`  - View logs:     hermes-fly logs -a ${config.appName}\n`);
    stdout.write(`  - Run doctor:    hermes-fly doctor -a ${config.appName}\n`);

    return { kind: "ok" };
  }

  private async resolveHermesRef(
    channel: "stable" | "preview" | "edge",
    stderr: { write: (s: string) => void }
  ): Promise<string> {
    // Honor HERMES_AGENT_REF override for emergency rollback/pinned ref
    const override = (this.env.HERMES_AGENT_REF ?? "").trim();
    if (override.length > 0) {
      return override;
    }

    switch (channel) {
      case "edge":
        return HERMES_AGENT_EDGE_REF;
      case "preview":
        return await this.fetchLatestHermesRelease(stderr);
      case "stable":
      default:
        return await this.fetchLatestHermesRelease(stderr);
    }
  }

  private async fetchLatestHermesRelease(
    stderr: { write: (s: string) => void }
  ): Promise<string> {
    // Check cache first
    if (latestReleaseCache && Date.now() - latestReleaseCache.fetchedAt < CACHE_TTL_MS) {
      return latestReleaseCache.ref;
    }

    try {
      const apiUrl = `https://api.github.com/repos/${HERMES_AGENT_REPO}/releases/latest`;
      const response = await fetch(apiUrl, {
        headers: {
          "Accept": "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          // Add a user-agent to be polite to GitHub API
          "User-Agent": "hermes-fly-cli",
        },
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "unknown error");
        throw new Error(`GitHub API returned ${response.status}: ${errorText}`);
      }

      const release: GitHubRelease = await response.json();
      const ref = release.target_commitish;
      const tag = release.tag_name;

      // Cache the result
      latestReleaseCache = { ref, tag, fetchedAt: Date.now() };

      return ref;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      stderr.write(`[warn] Failed to fetch latest release from GitHub: ${message}\n`);
      stderr.write(`[warn] Falling back to hardcoded ref: ${HERMES_AGENT_DEFAULT_REF.slice(0, 8)}...\n`);
      return HERMES_AGENT_DEFAULT_REF;
    }
  }
}
