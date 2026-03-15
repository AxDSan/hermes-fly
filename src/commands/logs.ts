import { FlyctlAdapter } from "../adapters/flyctl.js";
import { NodeProcessRunner } from "../adapters/process.js";
import { ShowLogsUseCase } from "../contexts/runtime/application/use-cases/show-logs.js";
import { FlyLogsReader } from "../contexts/runtime/infrastructure/adapters/fly-logs-reader.js";
import { resolveApp } from "./resolve-app.js";

interface LogsCommandOptions {
  stderr?: Pick<NodeJS.WriteStream, "write">;
  stdout?: Pick<NodeJS.WriteStream, "write">;
  useCase?: ShowLogsUseCase;
  env?: NodeJS.ProcessEnv;
}

export async function runLogsCommand(args: string[], options: LogsCommandOptions = {}): Promise<number> {
  const stderr = options.stderr ?? process.stderr;
  const stdout = options.stdout ?? process.stdout;
  const env = options.env ?? process.env;
  const useCase = options.useCase ?? buildUseCase();

  const appName = await resolveApp(args, { env });
  if (appName === null) {
    stderr.write("[error] No app specified. Use -a APP or run 'hermes-fly deploy' first.\n");
    return 1;
  }

  // Deterministic chunk policy:
  // - stdout chunks: write immediately to command stdout sink
  // - stderr chunks: buffer in memory during stream
  // - exitCode=0: flush buffered stderr exactly as captured
  // - exitCode!=0 or spawn error: drop buffered stderr; emit only contract failure line
  const stderrBuffer: string[] = [];

  let exitCode: number;
  try {
    const result = await useCase.stream(appName, {
      onStdoutChunk: (chunk: string) => { stdout.write(chunk); },
      onStderrChunk: (chunk: string) => { stderrBuffer.push(chunk); }
    });
    exitCode = result.exitCode;
  } catch {
    stderr.write(`[error] Failed to fetch logs for app '${appName}'\n`);
    return 1;
  }

  if (exitCode !== 0) {
    stderr.write(`[error] Failed to fetch logs for app '${appName}'\n`);
    return 1;
  }

  for (const chunk of stderrBuffer) {
    stderr.write(chunk);
  }

  return 0;
}

function buildUseCase(): ShowLogsUseCase {
  const runner = new NodeProcessRunner();
  const flyctl = new FlyctlAdapter(runner);
  const reader = new FlyLogsReader(flyctl);
  return new ShowLogsUseCase(reader);
}
