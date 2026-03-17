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
        ["ssh", "console", "-a", appName, "-C", buildRemoteHermesCommand(hermesArgs)],
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
  const command = renderedArgs.length > 0
    ? `cd ${shellEscape(REMOTE_HERMES_HOME)} && exec ${shellEscape(REMOTE_HERMES_PATH)} ${renderedArgs}`
    : `cd ${shellEscape(REMOTE_HERMES_HOME)} && exec ${shellEscape(REMOTE_HERMES_PATH)}`;
  return `sh -lc ${shellEscape(command)}`;
}

function shellEscape(value: string): string {
  return `'${value.replaceAll("'", `'\"'\"'`)}'`;
}
