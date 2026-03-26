import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runDeployCommand } from "../../src/commands/deploy.ts";
import type { DeployWizardPort, DeployConfig } from "../../src/contexts/deploy/application/ports/deploy-wizard.port.ts";

const DEFAULT_CONFIG: DeployConfig = {
  orgSlug: "personal",
  appName: "test-app",
  region: "iad",
  vmSize: "shared-cpu-1x",
  volumeSize: 5,
  provider: "openrouter",
  apiKey: "sk-test",
  model: "anthropic/claude-sonnet-4-20250514",
  channel: "stable",
  hermesRef: "8eefbef91cd715cfe410bba8c13cfab4eb3040df",
  botToken: ""
};

type MockOutputOptions = {
  isTTY?: boolean;
  columns?: number;
};

function makeIO(opts: { stdout?: MockOutputOptions; stderr?: MockOutputOptions } = {}) {
  const outLines: string[] = [];
  const errLines: string[] = [];
  const stdout = {
    write: (s: string) => { outLines.push(s); },
    isTTY: opts.stdout?.isTTY ?? true,
    columns: opts.stdout?.columns ?? 80,
  };
  const stderr = {
    write: (s: string) => { errLines.push(s); },
    isTTY: opts.stderr?.isTTY ?? true,
    columns: opts.stderr?.columns ?? 80,
  };
  return {
    stdout,
    stderr,
    get outText() { return outLines.join(""); },
    get errText() { return errLines.join(""); }
  };
}

function maxRenderedWidth(rendered: string): number {
  return rendered
    .trimEnd()
    .split("\n")
    .reduce((max, line) => Math.max(max, Array.from(line).length), 0);
}

async function withMockedTerminalWidth<T>(width: number, fn: () => Promise<T> | T): Promise<T> {
  const stream = process.stderr as NodeJS.WriteStream & { columns?: number };
  const hadOwn = Object.prototype.hasOwnProperty.call(stream, "columns");
  const previous = stream.columns;
  Object.defineProperty(stream, "columns", {
    value: width,
    configurable: true,
  });
  try {
    return await fn();
  } finally {
    if (hadOwn) {
      Object.defineProperty(stream, "columns", {
        value: previous,
        configurable: true,
      });
    } else {
      delete stream.columns;
    }
  }
}

function makeWizardPort(overrides: Partial<DeployWizardPort> = {}): DeployWizardPort {
  return {
    checkPlatform: async () => ({ ok: true }),
    checkPrerequisites: async () => ({ ok: true }),
    checkAuth: async () => ({ ok: true }),
    checkConnectivity: async () => ({ ok: true }),
    collectConfig: async () => DEFAULT_CONFIG,
    createBuildContext: async () => ({ buildDir: "/tmp/test-build" }),
    provisionResources: async () => ({ ok: true }),
    runDeploy: async () => ({ ok: true }),
    postDeployCheck: async () => ({ ok: true }),
    saveApp: async () => {},
    finalizeMessagingSetup: async () => ({}),
    chooseSuccessfulDeploymentAction: async () => "conclude",
    showTelegramBotDeletionGuidance: async () => {},
    ...overrides
  };
}

describe("runDeployCommand - successful deploy", () => {
  it("returns 0 on successful deploy", async () => {
    const io = makeIO();
    const code = await runDeployCommand({}, {
      wizard: makeWizardPort(),
      stdout: io.stdout,
      stderr: io.stderr
    });
    assert.equal(code, 0);
  });

  it("prints a deploy completion summary on success", async () => {
    const io = makeIO();

    const code = await runDeployCommand({}, {
      wizard: makeWizardPort(),
      stdout: io.stdout,
      stderr: io.stderr
    });

    assert.equal(code, 0);
    assert.match(io.outText, /Deployment complete/);
    assert.match(io.outText, /Deployment summary/);
    assert.match(io.outText, /Fly organization:\s+personal/);
    assert.match(io.outText, /Deployment name:\s+test-app/);
    assert.match(io.outText, /Location:\s+iad/);
    assert.match(io.outText, /Next steps/);
    assert.match(io.outText, /hermes-fly status -a test-app/);
  });

  it("prints the configured Telegram chat link when a bot is set up", async () => {
    const io = makeIO();

    const code = await runDeployCommand({}, {
      wizard: makeWizardPort({
        collectConfig: async () => ({
          ...DEFAULT_CONFIG,
          botToken: "123:abc",
          telegramBotUsername: "testhermesbot",
          telegramBotName: "Test Hermes Bot",
          telegramAllowedUsers: "1467489858"
        })
      }),
      stdout: io.stdout,
      stderr: io.stderr
    });

    assert.equal(code, 0);
    assert.match(io.outText, /Telegram:\s+@testhermesbot/);
    assert.match(io.outText, /Chat link:\s+https:\/\/t\.me\/testhermesbot\?start=test-app/);
  });

  it("keeps long completion commands and Telegram chat links copyable", async () => {
    const longAppName = `hermes-${"a".repeat(56)}`;
    const longTelegramUsername = `hermes${"bot".repeat(8)}`;
    const io = makeIO();

    const code = await runDeployCommand({}, {
      wizard: makeWizardPort({
        collectConfig: async () => ({
          ...DEFAULT_CONFIG,
          appName: longAppName,
          botToken: "123:abc",
          telegramBotUsername: longTelegramUsername,
          telegramBotName: "Long Hermes Bot",
          telegramAllowedUsers: "1467489858",
        })
      }),
      stdout: io.stdout,
      stderr: io.stderr
    });

    assert.equal(code, 0);
    assert.ok(io.outText.includes(`Chat link: https://t.me/${longTelegramUsername}?start=${longAppName}`), io.outText);
    assert.ok(io.outText.includes(`hermes-fly status -a ${longAppName}`), io.outText);
  });

  it("falls back to the plain completion summary on narrow terminals", async () => {
    const io = makeIO({ stdout: { columns: 40 } });

    const code = await runDeployCommand({}, {
      wizard: makeWizardPort({
        collectConfig: async () => ({
          ...DEFAULT_CONFIG,
          botToken: "123:abc",
          telegramBotUsername: "testhermesbot",
          telegramBotName: "Test Hermes Bot",
          telegramAllowedUsers: "1467489858"
        })
      }),
      stdout: io.stdout,
      stderr: io.stderr
    });

    assert.equal(code, 0);
    assert.match(io.outText, /Deployment summary/);
    assert.match(io.outText, /  Fly organization: personal/);
    assert.match(io.outText, /Next steps/);
    assert.match(io.outText, /Chat link: https:\/\/t\.me\/testhermesbot\?start=test-app/);
    assert.match(io.outText, /hermes-fly status -a test-app/);
    assert.doesNotMatch(io.outText, /◇  Deployment summary/);
    assert.doesNotMatch(io.outText, /◆  Next steps/);
  });

  it("falls back to the plain completion summary when stdout is redirected", async () => {
    await withMockedTerminalWidth(120, async () => {
      const io = makeIO({ stdout: { isTTY: false } });

      const code = await runDeployCommand({}, {
        wizard: makeWizardPort({
          collectConfig: async () => ({
            ...DEFAULT_CONFIG,
            botToken: "123:abc",
            telegramBotUsername: "testhermesbot",
            telegramBotName: "Test Hermes Bot",
            telegramAllowedUsers: "1467489858"
          })
        }),
        stdout: io.stdout,
        stderr: io.stderr
      });

      assert.equal(code, 0);
      assert.match(io.outText, /Deployment summary/);
      assert.match(io.outText, /  Fly organization: personal/);
      assert.match(io.outText, /Chat link: https:\/\/t\.me\/testhermesbot\?start=test-app/);
      assert.doesNotMatch(io.outText, /◇  Deployment summary/);
      assert.doesNotMatch(io.outText, /◆  Next steps/);
    });
  });

  it("uses the provided stdout width when rendering enhanced summaries", async () => {
    await withMockedTerminalWidth(120, async () => {
      const io = makeIO({ stdout: { columns: 64 } });

      const code = await runDeployCommand({}, {
        wizard: makeWizardPort({
          collectConfig: async () => ({
            ...DEFAULT_CONFIG,
            discordBotToken: "discord-live-token",
            discordApplicationId: "123456789012345678",
            discordBotUsername: "hermes-discord-bot-with-an-intentionally-long-handle",
            discordAllowedUsers: "123456789012345678,987654321098765432",
          })
        }),
        stdout: io.stdout,
        stderr: io.stderr
      });

      assert.equal(code, 0);
      assert.match(io.outText, /◇  Deployment summary/);
      assert.ok(maxRenderedWidth(io.outText) <= 64, io.outText);
    });
  });
});

describe("runDeployCommand - deploy failure guidance", () => {
  it("surfaces actionable capacity guidance instead of a resume hint", async () => {
    const io = makeIO();

    const code = await runDeployCommand({}, {
      wizard: makeWizardPort({
        collectConfig: async () => ({
          ...DEFAULT_CONFIG,
          region: "ams",
          vmSize: "shared-cpu-2x",
          messagingPlatforms: ["whatsapp"],
          whatsappEnabled: true,
          whatsappMode: "self-chat",
        }),
        runDeploy: async () => ({
          ok: false,
          failure: {
            kind: "capacity",
            summary: "Fly.io could not find room for a new server in that region right now.",
            detail: "insufficient memory available to fulfill request",
            suggestedVmSize: "performance-1x",
          }
        })
      }),
      stdout: io.stdout,
      stderr: io.stderr
    });

    assert.equal(code, 1);
    assert.match(io.errText, /Try the same deploy again in a few minutes\./);
    assert.match(io.errText, /If you want a safer default, choose Pro \(2 GB\)\./);
    assert.doesNotMatch(io.errText, /resume -a test-app/);
  });
});

describe("runDeployCommand - channel flag", () => {
  it("accepts a typed channel without error", async () => {
    const io = makeIO();
    const code = await runDeployCommand({ channel: "preview" }, {
      wizard: makeWizardPort(),
      stdout: io.stdout,
      stderr: io.stderr
    });
    assert.equal(code, 0);
  });

  it("normalizes invalid channel to stable", async () => {
    const captured: string[] = [];
    const io = makeIO();
    await runDeployCommand({ channel: "badvalue" }, {
      wizard: makeWizardPort({
        collectConfig: async (opts) => {
          captured.push(opts.channel);
          return { ...DEFAULT_CONFIG, channel: opts.channel };
        }
      }),
      stdout: io.stdout,
      stderr: io.stderr
    });
    assert.equal(captured[0], "stable");
  });
});

describe("runDeployCommand - no-auto-install flag", () => {
  it("accepts typed autoInstall=false without crashing", async () => {
    const io = makeIO();
    const code = await runDeployCommand({ autoInstall: false }, {
      wizard: makeWizardPort(),
      stdout: io.stdout,
      stderr: io.stderr
    });
    assert.equal(code, 0);
  });

  it("passes autoInstall=false when the typed input disables auto-install", async () => {
    const captured: Array<{ autoInstall: boolean }> = [];
    const io = makeIO();
    await runDeployCommand({ autoInstall: false }, {
      wizard: makeWizardPort({
        checkPrerequisites: async (opts) => {
          captured.push(opts);
          return { ok: true };
        }
      }),
      stdout: io.stdout,
      stderr: io.stderr
    });
    assert.equal(captured[0]?.autoInstall, false);
  });
});

describe("runDeployCommand - config collection failure", () => {
  it("returns 1 when config collection fails", async () => {
    const io = makeIO();
    const code = await runDeployCommand({}, {
      wizard: makeWizardPort({
        collectConfig: async () => {
          throw new Error("OPENROUTER_API_KEY is required in non-interactive mode");
        }
      }),
      stdout: io.stdout,
      stderr: io.stderr
    });
    assert.equal(code, 1);
  });
});

describe("runDeployCommand - wizard failure", () => {
  it("returns 1 when wizard fails", async () => {
    const io = makeIO();
    const code = await runDeployCommand({}, {
      wizard: makeWizardPort({
        checkPlatform: async () => ({ ok: false, error: "unsupported platform" })
      }),
      stdout: io.stdout,
      stderr: io.stderr
    });
    assert.equal(code, 1);
  });
});
