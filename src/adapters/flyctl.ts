import type { ProcessRunner } from "./process.js";

export interface FlyctlPort {
  getMachineState(appName: string): Promise<string | null>;
}

export class FlyctlAdapter implements FlyctlPort {
  constructor(private readonly processRunner: ProcessRunner) {}

  async getMachineState(appName: string): Promise<string | null> {
    let result;
    try {
      result = await this.processRunner.run("fly", ["status", "--app", appName, "--json"]);
    } catch {
      return null;
    }

    if (result.exitCode !== 0) {
      return null;
    }

    try {
      const parsed = JSON.parse(result.stdout) as {
        machines?: Array<Record<string, unknown>>;
        Machines?: Array<Record<string, unknown>>;
      };

      const machines = Array.isArray(parsed.machines)
        ? parsed.machines
        : Array.isArray(parsed.Machines)
          ? parsed.Machines
          : [];

      if (machines.length === 0) {
        return null;
      }

      const first = machines[0] ?? {};
      const state = first.state;
      if (typeof state === "string" && state.length > 0) {
        return state;
      }

      return null;
    } catch {
      return null;
    }
  }
}
