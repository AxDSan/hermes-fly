import { FlyctlAdapter } from "../adapters/flyctl.js";
import { NodeProcessRunner } from "../adapters/process.js";
import { ListDeploymentsUseCase } from "../contexts/runtime/application/use-cases/list-deployments.js";
import { FlyDeploymentRegistry } from "../contexts/runtime/infrastructure/adapters/fly-deployment-registry.js";

interface ListCommandOptions {
  stdout?: Pick<NodeJS.WriteStream, "write">;
  useCase?: ListDeploymentsUseCase;
}

export async function runListCommand(options: ListCommandOptions = {}): Promise<number> {
  const stdout = options.stdout ?? process.stdout;
  const useCase = options.useCase ?? buildUseCase();

  const result = await useCase.execute();
  if (result.kind === "empty") {
    stdout.write("No deployed agents found. Run: hermes-fly deploy\n");
    return 0;
  }

  stdout.write(formatRow("App Name", "Region", "Platform", "Machine"));
  stdout.write(formatRow("--------------------------", "------", "--------", "-------"));

  for (const row of result.rows) {
    stdout.write(formatRow(row.appName, row.region, row.platform, row.machine));
  }

  return 0;
}

function buildUseCase(): ListDeploymentsUseCase {
  const flyctl = new FlyctlAdapter(new NodeProcessRunner());
  const registry = new FlyDeploymentRegistry({ flyctl });
  return new ListDeploymentsUseCase(registry);
}

function formatRow(appName: string, region: string, platform: string, machine: string): string {
  return `  ${pad(appName, 26)} ${pad(region, 8)} ${pad(platform, 10)} ${pad(machine, 9)}\n`;
}

function pad(value: string, width: number): string {
  if (value.length >= width) {
    return value;
  }

  return value + " ".repeat(width - value.length);
}
