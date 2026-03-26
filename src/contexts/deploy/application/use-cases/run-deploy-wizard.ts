import type {
  DeployConfig,
  DeployRunResult,
  DeployWizardPort,
  FinalizeMessagingSetupResult,
} from "../ports/deploy-wizard.port.js";
import type { DeployFailure } from "../../domain/deploy-failure.js";
import type { PostDeployCleanupPort } from "../ports/post-deploy-cleanup.port.js";
import {
  renderDeployCopyableSection,
  renderDeployKeyValuePanel,
  supportsEnhancedDeploySummary,
} from "../presentation/deploy-screen.js";

const VALID_CHANNELS = new Set(["stable", "preview", "edge"]);

export type DeployWizardResult =
  | { kind: "ok" }
  | { kind: "failed"; error: string };

export type DeployChannel = "stable" | "preview" | "edge";
export type DeployOutputWriter = {
  write: (s: string) => void;
  isTTY?: boolean;
  columns?: number;
};

const VM_SIZE_LABELS = new Map<string, string>([
  ["shared-cpu-1x", "Starter (shared-cpu-1x, 256 MB)"],
  ["shared-cpu-2x", "Standard (shared-cpu-2x, 512 MB)"],
  ["performance-1x", "Pro (performance-1x, 2 GB)"],
  ["performance-2x", "Power (performance-2x, 4 GB)"],
]);
const VM_SIZE_UPGRADE_LABELS = new Map<string, string>([
  ["shared-cpu-2x", "Standard (512 MB)"],
  ["performance-1x", "Pro (2 GB)"],
  ["performance-2x", "Power (4 GB)"],
]);
const WHATSAPP_SELF_CHAT_DETECTED_ACCESS_LABEL = "Only me (detected after pairing)";

function resolveChannel(input: string): DeployChannel {
  return VALID_CHANNELS.has(input) ? (input as DeployChannel) : "stable";
}

function describeVmSize(vmSize: string): string {
  return VM_SIZE_LABELS.get(vmSize) ?? vmSize;
}

function describeVmSizeUpgrade(vmSize: string): string {
  return VM_SIZE_UPGRADE_LABELS.get(vmSize) ?? describeVmSize(vmSize);
}

function writeDeployFailure(stderr: DeployOutputWriter, failure: DeployFailure, config: DeployConfig): void {
  stderr.write(`[error] ${failure.summary}\n`);
  if (failure.detail) {
    stderr.write(`Fly.io said: ${failure.detail}\n`);
  }

  if (failure.kind === "capacity") {
    stderr.write("Try the same deploy again in a few minutes.\n");
    stderr.write("If it keeps failing, rerun deploy and choose a different region.\n");
    if (failure.suggestedVmSize) {
      stderr.write(`If you want a safer default, choose ${describeVmSizeUpgrade(failure.suggestedVmSize)}.\n`);
    }
    stderr.write(`If you want to clean up this partial app first, run 'hermes-fly destroy -a ${config.appName}'.\n`);
    return;
  }

  stderr.write("Scroll up to the first Fly.io error above for the exact cause.\n");
  stderr.write(`If you want to clean up this partial app first, run 'hermes-fly destroy -a ${config.appName}'.\n`);
}

function describeTelegram(config: DeployConfig): string | undefined {
  if (!config.botToken) {
    return undefined;
  }
  if (config.telegramBotUsername && config.telegramBotName) {
    return `@${config.telegramBotUsername} (${config.telegramBotName})`;
  }
  if (config.telegramBotUsername) {
    return `@${config.telegramBotUsername}`;
  }
  if (config.telegramBotName) {
    return config.telegramBotName;
  }
  return "configured";
}

function describeTelegramAccess(config: DeployConfig): string | undefined {
  if (!config.botToken) {
    return undefined;
  }
  if (config.gatewayAllowAllUsers) {
    return "Anyone";
  }
  if (!config.telegramAllowedUsers) {
    return undefined;
  }

  const users = config.telegramAllowedUsers.split(",").map((value) => value.trim()).filter(Boolean);
  if (users.length === 1) {
    return `Only me (${users[0]})`;
  }
  if (users.length > 1) {
    return `Specific people (${users.join(", ")})`;
  }
  return undefined;
}

function buildTelegramChatLink(config: DeployConfig): string | undefined {
  if (!config.telegramBotUsername) {
    return undefined;
  }
  return `https://t.me/${config.telegramBotUsername}?start=${config.appName}`;
}

function describeDiscord(config: DeployConfig): string | undefined {
  if (!config.discordBotToken) {
    return undefined;
  }
  if (config.discordBotUsername && config.discordApplicationId) {
    return `@${config.discordBotUsername} (${config.discordApplicationId})`;
  }
  if (config.discordBotUsername) {
    return `@${config.discordBotUsername}`;
  }
  if (config.discordApplicationId) {
    return config.discordApplicationId;
  }
  return "configured";
}

function describeDiscordAccess(config: DeployConfig): string | undefined {
  if (!config.discordBotToken) {
    return undefined;
  }
  if (config.gatewayAllowAllUsers) {
    return "Anyone";
  }
  if (config.discordUsePairing) {
    return "Only me (DM pairing)";
  }
  if (!config.discordAllowedUsers) {
    return undefined;
  }
  return `Specific people (${config.discordAllowedUsers})`;
}

function describeSlack(config: DeployConfig): string | undefined {
  if (!config.slackBotToken || !config.slackAppToken) {
    return undefined;
  }
  if (config.slackTeamName) {
    return config.slackTeamName;
  }
  return "configured";
}

function describeSlackAccess(config: DeployConfig): string | undefined {
  if (!config.slackBotToken || !config.slackAppToken) {
    return undefined;
  }
  if (config.gatewayAllowAllUsers) {
    return "Anyone";
  }
  if (config.slackUsePairing) {
    return "Only me (DM pairing)";
  }
  if (!config.slackAllowedUsers) {
    return undefined;
  }
  return `Specific people (${config.slackAllowedUsers})`;
}

function describeWhatsApp(config: DeployConfig): string | undefined {
  if (!config.whatsappEnabled) {
    return undefined;
  }
  const mode = config.whatsappMode ?? "bot";
  return mode === "self-chat" ? "Self-chat" : "Bot mode";
}

function describeWhatsAppAccess(config: DeployConfig): string | undefined {
  if (!config.whatsappEnabled) {
    return undefined;
  }
  if (config.gatewayAllowAllUsers) {
    return "Anyone";
  }
  if (config.whatsappCompleteAccessDuringSetup) {
    if (config.whatsappMode === "self-chat" && !config.whatsappAllowedUsers) {
      return WHATSAPP_SELF_CHAT_DETECTED_ACCESS_LABEL;
    }
    if (config.whatsappAllowedUsers) {
      const ownNumber = config.whatsappAllowedUsers.split(",").map((value) => value.trim()).filter(Boolean)[0];
      if (ownNumber) {
        return `Only me (${ownNumber})`;
      }
    }
    return "Only me";
  }
  if (config.whatsappUsePairing) {
    return "Only me (finish during WhatsApp setup)";
  }
  if (!config.whatsappAllowedUsers) {
    return undefined;
  }
  return `Specific people (${config.whatsappAllowedUsers})`;
}

function describeAiAccess(provider: string): string {
  if (provider === "anthropic") {
    return "Anthropic OAuth";
  }
  if (provider === "openai-codex") {
    return "ChatGPT subscription (OpenAI Codex)";
  }
  if (provider === "nous") {
    return "Nous Portal OAuth";
  }
  if (provider === "zai") {
    return "Z.AI GLM API key";
  }
  return "OpenRouter API key";
}

function shouldUseEnhancedCompletionSummary(stdout: DeployOutputWriter): boolean {
  if (stdout.isTTY !== true) {
    return false;
  }
  return supportsEnhancedDeploySummary(stdout.columns);
}

function writeCompletionSummary(stdout: DeployOutputWriter, config: DeployConfig): void {
  const entries: Array<[string, string]> = [
    ["Fly organization", config.orgSlug],
    ["Deployment name", config.appName],
    ["Location", config.region],
    ["Server size", describeVmSize(config.vmSize)],
    ["Storage", `${config.volumeSize} GB`],
    ["AI access", describeAiAccess(config.provider)],
    ["AI model", config.model],
  ];
  if (config.reasoningEffort) {
    entries.push(["Reasoning", config.reasoningEffort]);
  }
  entries.push(["Hermes ref", config.hermesRef.slice(0, 8)]);
  entries.push(["Release channel", config.channel]);

  const telegram = describeTelegram(config);
  const copyableLines: string[] = [];
  if (telegram) {
    entries.push(["Telegram", telegram]);
    const access = describeTelegramAccess(config);
    if (access) {
      entries.push(["Telegram access", access]);
    }
    if (config.telegramHomeChannel) {
      entries.push(["Home channel", config.telegramHomeChannel]);
    }
    const chatLink = buildTelegramChatLink(config);
    if (chatLink) {
      copyableLines.push(`Chat link: ${chatLink}`);
    }
  }

  const discord = describeDiscord(config);
  if (discord) {
    entries.push(["Discord", discord]);
    const access = describeDiscordAccess(config);
    if (access) {
      entries.push(["Discord access", access]);
    }
  }

  const slack = describeSlack(config);
  if (slack) {
    entries.push(["Slack", slack]);
    const access = describeSlackAccess(config);
    if (access) {
      entries.push(["Slack access", access]);
    }
  }

  const whatsapp = describeWhatsApp(config);
  if (whatsapp) {
    entries.push(["WhatsApp", whatsapp]);
    const access = describeWhatsAppAccess(config);
    if (access) {
      entries.push(["WhatsApp access", access]);
    }
  }

  copyableLines.push(
    `hermes-fly status -a ${config.appName}`,
    `hermes-fly logs -a ${config.appName}`,
    `hermes-fly doctor -a ${config.appName}`,
  );

  if (!shouldUseEnhancedCompletionSummary(stdout)) {
    stdout.write("Deployment complete\n");
    stdout.write("Your Hermes agent is live on Fly.io.\n\n");
    stdout.write("Deployment summary\n");
    for (const [label, value] of entries) {
      stdout.write(`  ${label}: ${value}\n`);
    }
    stdout.write("\n");
    stdout.write("Next steps\n");
    for (const line of copyableLines) {
      stdout.write(`  ${line}\n`);
    }
    stdout.write("\n");
    return;
  }

  stdout.write("◆  Deployment complete\n");
  stdout.write("│\n");
  stdout.write("│  Your Hermes agent is live on Fly.io.\n");
  stdout.write("└\n\n");
  stdout.write(renderDeployKeyValuePanel({
    title: "Deployment summary",
    entries,
    width: stdout.columns,
  }));
  stdout.write(renderDeployCopyableSection({
    title: "Next steps",
    question: "Use these links and commands after deploy:",
    lines: copyableLines,
    width: stdout.columns,
  }));
}

export class RunDeployWizardUseCase {
  constructor(
    private readonly port: DeployWizardPort,
    private readonly cleanupPort?: PostDeployCleanupPort
  ) {}

  async execute(
    opts: { autoInstall: boolean; channel: string; noCache?: boolean },
    stderr: DeployOutputWriter,
    stdout: DeployOutputWriter = { write: () => {} }
  ): Promise<DeployWizardResult> {
    const channel = resolveChannel(opts.channel);

    // Phase 1: Preflight checks
    const platformResult = await this.port.checkPlatform();
    if (!platformResult.ok) {
      stderr.write(`[error] Platform check failed: ${platformResult.error ?? "unsupported platform"}\n`);
      return { kind: "failed", error: platformResult.error ?? "unsupported platform" };
    }

    const prereqResult = await this.port.checkPrerequisites({ autoInstall: opts.autoInstall });
    if (!prereqResult.ok) {
      if (prereqResult.autoInstallDisabled) {
        stderr.write(`[error] '${prereqResult.missing ?? "fly"}' not found (auto-install disabled). Install manually and retry.\n`);
      } else if (prereqResult.error) {
        stderr.write(`[error] ${prereqResult.error}\n`);
      } else {
        stderr.write(`[error] Missing prerequisite: ${prereqResult.missing ?? "unknown"}\n`);
      }
      return { kind: "failed", error: `Missing prerequisite: ${prereqResult.missing}` };
    }

    const authResult = await this.port.checkAuth();
    if (!authResult.ok) {
      if (authResult.error && authResult.error !== "not authenticated") {
        stderr.write(`[error] ${authResult.error}\n`);
      } else {
        stderr.write(`[error] Not authenticated. Run: fly auth login\n`);
      }
      return { kind: "failed", error: authResult.error ?? "not authenticated" };
    }

    const connectResult = await this.port.checkConnectivity();
    if (!connectResult.ok) {
      stderr.write(`[error] No internet connectivity.\n`);
      return { kind: "failed", error: "no connectivity" };
    }

    // Phase 2: Collect config (interactive)
    let config: DeployConfig;
    try {
      config = await this.port.collectConfig({ channel });
      // Pass noCache option to config
      config.noCache = opts.noCache ?? false;
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to collect deploy configuration";
      if (message === "Deployment cancelled.") {
        stderr.write(`${message}\n`);
      } else {
        stderr.write(`[error] ${message}\n`);
      }
      return { kind: "failed", error: message };
    }

    // Phase 3: Create build context
    const { buildDir } = await this.port.createBuildContext(config);

    // Phase 4: Provision resources
    const provisionResult = await this.port.provisionResources(config);
    if (!provisionResult.ok) {
      stderr.write(`[error] Provisioning failed: ${provisionResult.error ?? "unknown error"}\n`);
      return { kind: "failed", error: provisionResult.error ?? "provisioning failed" };
    }

    // Phase 5: Run deploy — preserve resources even on failure
    const deployResult: DeployRunResult = await this.port.runDeploy(buildDir, config);
    if (!deployResult.ok) {
      // Save app so resume works
      await this.port.saveApp(config);
      writeDeployFailure(stderr, deployResult.failure, config);
      return { kind: "failed", error: deployResult.failure.summary };
    }

    // Phase 6: Post-deploy check
    const postResult = await this.port.postDeployCheck(config.appName);
    if (!postResult.ok) {
      stderr.write(`[warn] Post-deploy check failed: ${postResult.error ?? "App may still be starting up."}\n`);
      stderr.write(`Tip: run 'hermes-fly resume -a ${config.appName}' to re-check.\n`);
    }

    // Save app configuration
    await this.port.saveApp(config);

    writeCompletionSummary(stdout, config);
    const finalizeResult = (await this.port.finalizeMessagingSetup(config, stdout, stderr) ?? {}) as FinalizeMessagingSetupResult;

    const action = await this.port.chooseSuccessfulDeploymentAction(config);
    if (action === "destroy") {
      if (!this.cleanupPort) {
        stderr.write("[error] Destroy action requested, but no cleanup handler is available.\n");
        return { kind: "failed", error: "destroy handler unavailable" };
      }

      stdout.write("\nDestroying the deployment you just created...\n");
      const cleanupResult = await this.cleanupPort.destroyDeployment(config.appName, { stdout, stderr });
      if (!cleanupResult.ok) {
        if (cleanupResult.notFound) {
          return { kind: "failed", error: "destroyed app not found" };
        }
        stderr.write(`[error] Post-deploy cleanup failed: ${cleanupResult.error ?? "unknown error"}\n`);
        return { kind: "failed", error: cleanupResult.error ?? "post-deploy cleanup failed" };
      }

      if (config.botToken) {
        await this.port.showTelegramBotDeletionGuidance(config);
      }
    } else if (finalizeResult.whatsappSessionConfirmed) {
      await this.port.saveApp({
        ...config,
        whatsappSessionConfirmed: true,
      });
    }

    return { kind: "ok" };
  }
}
