import { NodeProcessRunner } from "../adapters/process.js";
import { OpenConsoleUseCase } from "../contexts/runtime/application/use-cases/open-console.js";
import { FlyAgentConsole } from "../contexts/runtime/infrastructure/adapters/fly-agent-console.js";
import { readCurrentApp } from "../contexts/runtime/infrastructure/adapters/current-app-config.js";

interface ConsoleCommandOptions {
  stderr?: Pick<NodeJS.WriteStream, "write">;
  useCase?: OpenConsoleUseCase;
  env?: NodeJS.ProcessEnv;
}

export async function runConsoleCommand(args: string[], options: ConsoleCommandOptions = {}): Promise<number> {
  const stderr = options.stderr ?? process.stderr;
  const env = options.env ?? process.env;
  const useCase = options.useCase ?? buildUseCase(env);

  const { appName, hermesArgs } = await resolveConsoleInvocation(args, env);
  if (appName === null) {
    stderr.write("[error] No app specified. Use -a APP or run 'hermes-fly deploy' first.\n");
    return 1;
  }

  const result = await useCase.execute(appName, hermesArgs);
  if (result.kind === "error") {
    if (isFlyCliMissing(result.message)) {
      stderr.write("[error] Fly.io CLI not found. Install flyctl and retry.\n");
    } else {
      stderr.write(`[error] ${result.message}\n`);
    }
    return 1;
  }

  return 0;
}

function buildUseCase(env: NodeJS.ProcessEnv): OpenConsoleUseCase {
  const runner = new NodeProcessRunner();
  const port = new FlyAgentConsole(runner, env);
  return new OpenConsoleUseCase(port);
}

async function resolveConsoleInvocation(
  args: string[],
  env: NodeJS.ProcessEnv
): Promise<{ appName: string | null; hermesArgs: string[] }> {
  let explicitApp: string | null = null;
  let explicitFlagSeen = false;
  const remaining: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "-a") {
      explicitFlagSeen = true;
      const next = args[index + 1];
      if (typeof next === "string" && next.length > 0) {
        explicitApp = next;
        index += 1;
      } else {
        explicitApp = null;
      }
      continue;
    }
    remaining.push(arg);
  }

  if (explicitFlagSeen) {
    return { appName: explicitApp, hermesArgs: remaining };
  }

  if (remaining.length > 0) {
    const [appName, ...hermesArgs] = remaining;
    return { appName, hermesArgs };
  }

  return { appName: await readCurrentApp({ env }), hermesArgs: [] };
}

function isFlyCliMissing(message: string): boolean {
  return message.includes("spawn fly ENOENT") || message.includes("ENOENT");
}
