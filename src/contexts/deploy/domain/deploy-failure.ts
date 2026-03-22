export type DeployFailureKind = "capacity" | "generic";

export interface DeployFailure {
  kind: DeployFailureKind;
  summary: string;
  detail?: string;
  suggestedVmSize?: string;
}

export interface DeployFailureInput {
  rawOutput?: string;
  vmSize: string;
}

const VM_SIZE_UPGRADE_PATH: Record<string, string | undefined> = {
  "shared-cpu-1x": "shared-cpu-2x",
  "shared-cpu-2x": "performance-1x",
  "performance-1x": "performance-2x",
};

const CAPACITY_MARKERS = [
  "insufficient resources available to fulfill request",
  "insufficient memory available to fulfill request",
  "could not reserve resource for machine",
];

function normalizeLine(line: string): string {
  return line
    .replace(/\u001B\[[0-9;]*m/g, "")
    .replace(/^[\s\-│]*✖\s*Failed:\s*/i, "")
    .replace(/^Error:\s*/i, "")
    .trim();
}

function cleanLines(rawOutput?: string): string[] {
  return (rawOutput ?? "")
    .split("\n")
    .map((line) => normalizeLine(line))
    .filter(Boolean);
}

export class DeployFailurePolicy {
  static classify(input: DeployFailureInput): DeployFailure {
    const lines = cleanLines(input.rawOutput);
    const combined = lines.join("\n").toLowerCase();

    if (CAPACITY_MARKERS.some((marker) => combined.includes(marker))) {
      const detail = this.extractCapacityDetail(lines);
      return {
        kind: "capacity",
        summary: "Fly.io could not find room for a new server in that region right now.",
        ...(detail ? { detail } : {}),
        ...(VM_SIZE_UPGRADE_PATH[input.vmSize] ? { suggestedVmSize: VM_SIZE_UPGRADE_PATH[input.vmSize] } : {}),
      };
    }

    const detail = this.extractGenericDetail(lines);
    return {
      kind: "generic",
      summary: "Fly.io stopped the deploy before Hermes could finish setup.",
      ...(detail ? { detail } : {}),
    };
  }

  private static extractCapacityDetail(lines: string[]): string | undefined {
    for (const line of lines) {
      if (/insufficient memory available to fulfill request/i.test(line)) {
        return "insufficient memory available to fulfill request";
      }
    }
    for (const line of lines) {
      if (/insufficient resources available to fulfill request/i.test(line)) {
        return "insufficient resources available to fulfill request";
      }
    }
    for (const line of lines) {
      if (/could not reserve resource for machine/i.test(line)) {
        return "could not reserve resource for machine";
      }
    }
    return undefined;
  }

  private static extractGenericDetail(lines: string[]): string | undefined {
    if (lines.length === 0) {
      return undefined;
    }
    return lines[lines.length - 1];
  }
}
