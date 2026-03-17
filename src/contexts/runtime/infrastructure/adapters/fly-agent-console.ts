import type { ForegroundProcessRunner } from "../../../../adapters/process.js";
import { resolveFlyCommand } from "../../../../adapters/fly-command.js";
import type { AgentConsolePort } from "../../application/ports/agent-console.port.js";

const REMOTE_HERMES_PATH = "/opt/hermes/hermes-agent/venv/bin/hermes";
const REMOTE_HERMES_HOME = "/root/.hermes";

export class FlyAgentConsole implements AgentConsolePort {
  constructor(
    private readonly processRunner: ForegroundProcessRunner,
    private readonly env?: NodeJS.ProcessEnv
  ) {}

  async openConsole(appName: string, hermesArgs: string[]): Promise<{ ok: boolean; error?: string }> {
    try {
      const flyCommand = await resolveFlyCommand(this.env);
      const result = await this.processRunner.runForeground(
        flyCommand,
        ["ssh", "console", "-a", appName, "--pty", "-C", buildRemoteHermesCommand(hermesArgs)],
        { env: this.env }
      );
      if (result.exitCode !== 0) {
        return { ok: false, error: `Failed to open Hermes CLI for app '${appName}'.` };
      }
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: message };
    }
  }
}

function buildRemoteHermesCommand(hermesArgs: string[]): string {
  const renderedArgs = hermesArgs.map(shellEscape).join(" ");
  const launchHermes = renderedArgs.length > 0
    ? `cd ${shellEscape(REMOTE_HERMES_HOME)} && exec ${shellEscape(REMOTE_HERMES_PATH)} ${renderedArgs}`
    : `cd ${shellEscape(REMOTE_HERMES_HOME)} && exec ${shellEscape(REMOTE_HERMES_PATH)}`;
  const anthropicBootstrap = [
    "export HOME=/root",
    `if [ -z "\${ANTHROPIC_TOKEN:-}" ] && [ -f ${shellEscape(`${REMOTE_HERMES_HOME}/.anthropic_oauth.json`)} ]; then`,
    `  _anthropic_token="$(python3 -c ${shellEscape(
      "import json; from pathlib import Path; data = json.loads(Path('/root/.hermes/.anthropic_oauth.json').read_text(encoding='utf-8')); token = str(data.get('accessToken', '')).strip(); print(token) if token else None"
    )} 2>/dev/null || true)"`,
    '  if [ -n "$_anthropic_token" ]; then',
    '    export ANTHROPIC_TOKEN="$_anthropic_token"',
    '  fi',
    "fi",
    launchHermes,
  ].join("\n");
  return `sh -lc ${shellEscape(anthropicBootstrap)}`;
}

function shellEscape(value: string): string {
  return `'${value.replaceAll("'", `'\"'\"'`)}'`;
}
