import { RunDeployWizardUseCase } from "../contexts/deploy/application/use-cases/run-deploy-wizard.js";
import type { DeployWizardPort } from "../contexts/deploy/application/ports/deploy-wizard.port.js";
import { FlyDeployWizard } from "../contexts/deploy/infrastructure/adapters/fly-deploy-wizard.js";
import { DestroyDeploymentAdapter } from "../contexts/deploy/infrastructure/adapters/destroy-deployment-adapter.js";
import { DestroyDeploymentUseCase } from "../contexts/release/application/use-cases/destroy-deployment.js";
import { FlyDestroyRunner } from "../contexts/release/infrastructure/adapters/fly-destroy-runner.js";
import { NodeProcessRunner } from "../adapters/process.js";

export interface DeployCommandOptions {
  wizard?: DeployWizardPort;
  stdout?: { write: (s: string) => void };
  stderr?: { write: (s: string) => void };
  env?: NodeJS.ProcessEnv;
}

function parseDeployArgs(args: string[]): { channel: string; autoInstall: boolean; noCache: boolean } {
  let channel = "stable";
  let autoInstall = true;
  let noCache = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--channel" && i + 1 < args.length) {
      channel = args[++i];
    } else if (args[i] === "--no-auto-install") {
      autoInstall = false;
    } else if (args[i] === "--no-cache") {
      noCache = true;
    }
  }

  return { channel, autoInstall, noCache };
}

export async function runDeployCommand(
  args: string[],
  options: DeployCommandOptions = {}
): Promise<number> {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const { channel, autoInstall, noCache } = parseDeployArgs(args);

  const wizard = options.wizard ?? new FlyDeployWizard(options.env);
  const cleanup = new DestroyDeploymentAdapter(
    new DestroyDeploymentUseCase(
      new FlyDestroyRunner(new NodeProcessRunner(), options.env)
    )
  );

  const useCase = new RunDeployWizardUseCase(wizard, cleanup);
  const result = await useCase.execute({ autoInstall, channel, noCache }, stderr, stdout);

  return result.kind === "ok" ? 0 : 1;
}
