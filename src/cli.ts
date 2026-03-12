import { Command } from "commander";
import { runListCommand } from "./commands/list.js";
import { HERMES_FLY_TS_VERSION } from "./version.js";

export function buildProgram(): Command {
  return new Command()
    .name("hermes-fly")
    .description("Hermes Fly TypeScript CLI scaffold")
    .version(HERMES_FLY_TS_VERSION, "--version", "Show version")
    .command("list")
    .description("List deployed agents")
    .action(async () => {
      process.exitCode = await runListCommand();
    });
}

export async function run(argv: string[]): Promise<void> {
  const program = buildProgram();
  await program.parseAsync(argv);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run(process.argv).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`TS CLI error: ${message}\n`);
    process.exitCode = 1;
  });
}
