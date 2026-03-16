import { RunDeployWizardUseCase } from "../contexts/deploy/application/use-cases/run-deploy-wizard.js";
import type { DeployWizardPort } from "../contexts/deploy/application/ports/deploy-wizard.port.js";
import { FlyDeployWizard } from "../contexts/deploy/infrastructure/adapters/fly-deploy-wizard.js";

export interface DeployCommandOptions {
  wizard?: DeployWizardPort;
  stderr?: { write: (s: string) => void };
  env?: NodeJS.ProcessEnv;
}

function parseDeployArgs(args: string[]): { channel: string; autoInstall: boolean } {
  let channel = "stable";
  let autoInstall = true;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--channel" && i + 1 < args.length) {
      channel = args[++i];
    } else if (args[i] === "--no-auto-install") {
      autoInstall = false;
    }
  }

  return { channel, autoInstall };
}

export async function runDeployCommand(
  args: string[],
  options: DeployCommandOptions = {}
): Promise<number> {
  const stderr = options.stderr ?? process.stderr;
  const { channel, autoInstall } = parseDeployArgs(args);

  const wizard = options.wizard ?? new FlyDeployWizard(options.env);

  const useCase = new RunDeployWizardUseCase(wizard);
  const result = await useCase.execute({ autoInstall, channel }, stderr);

  return result.kind === "ok" ? 0 : 1;
}
