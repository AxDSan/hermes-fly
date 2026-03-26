import { RunDeployWizardUseCase } from "../contexts/deploy/application/use-cases/run-deploy-wizard.js";
import type { DeployOutputWriter } from "../contexts/deploy/application/use-cases/run-deploy-wizard.js";
import type { DeployWizardPort } from "../contexts/deploy/application/ports/deploy-wizard.port.js";
import { FlyDeployWizard } from "../contexts/deploy/infrastructure/adapters/fly-deploy-wizard.js";
import { DestroyDeploymentAdapter } from "../contexts/deploy/infrastructure/adapters/destroy-deployment-adapter.js";
import { DestroyDeploymentUseCase } from "../contexts/release/application/use-cases/destroy-deployment.js";
import { FlyDestroyRunner } from "../contexts/release/infrastructure/adapters/fly-destroy-runner.js";
import { NodeProcessRunner } from "../adapters/process.js";

export interface DeployCommandOptions {
  wizard?: DeployWizardPort;
  stdout?: DeployOutputWriter;
  stderr?: DeployOutputWriter;
  env?: NodeJS.ProcessEnv;
}

export type DeployCommandInput = {
  channel?: string;
  autoInstall?: boolean;
  noCache?: boolean;
};

export async function runDeployCommand(
  input: DeployCommandInput = {},
  options: DeployCommandOptions = {}
): Promise<number> {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const channel = input.channel ?? "stable";
  const autoInstall = input.autoInstall ?? true;
  const noCache = input.noCache ?? false;

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
