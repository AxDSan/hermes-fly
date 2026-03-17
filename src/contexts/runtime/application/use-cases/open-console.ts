import type { AgentConsolePort } from "../ports/agent-console.port.js";

export type OpenConsoleResult =
  | { kind: "ok" }
  | { kind: "error"; message: string };

export class OpenConsoleUseCase {
  constructor(private readonly port: AgentConsolePort) {}

  async execute(appName: string, hermesArgs: string[]): Promise<OpenConsoleResult> {
    const result = await this.port.openConsole(appName, hermesArgs);
    if (!result.ok) {
      return { kind: "error", message: result.error ?? "failed to open console" };
    }

    return { kind: "ok" };
  }
}
