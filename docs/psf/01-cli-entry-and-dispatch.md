# CLI Entry Point and Command Dispatch

PSF for the shell shim, Commander.js program setup, and command routing layer.

**Related PSFs**: [00-architecture](00-hermes-fly-architecture-overview.md) | [02-deploy](02-deploy-bounded-context.md) | [06-infrastructure](06-cross-cutting-infrastructure.md)

## 1. TL;DR

- **Shell shim** (`hermes-fly`, 14 lines): resolves symlinks, `exec node dist/cli.js`
- **Commander.js program** (`src/cli.ts`, 141 lines): registers 9 commands, handles errors
- **Command modules** (`src/commands/*.ts`): parse args, build dependency graph, call use-cases
- **App resolution** (`src/commands/resolve-app.ts`): `-a` flag > `config.yaml:current_app` > null

## 2. Shell Shim

`hermes-fly` (project root, 14 lines):
```bash
#!/usr/bin/env bash
set -euo pipefail
# Resolve symlinks so dist/ is found relative to the real file location
# ... symlink resolution loop ...
exec node "${SCRIPT_DIR}/dist/cli.js" "$@"
```

The shim exists solely to provide a shell-executable entry point. All logic lives in TypeScript.

## 3. Commander.js Program

`src/cli.ts` exports `buildProgram()` and `run(argv)`:

```mermaid
graph LR
    SHIM["hermes-fly"] --> NODE["node dist/cli.js"]
    NODE --> RUN["run(process.argv)"]
    RUN --> BP["buildProgram()"]
    BP --> PA["program.parseAsync(argv)"]
    PA --> CMD["Command handler"]
    CMD --> UC["Use-case"]
    UC --> EXIT["process.exitCode"]
```

**Key behaviors:**
- No args (argv.length <= 2) → shows help, exits 0
- Unknown command → `[error] Unknown command: X`, exits 1
- Unhandled exception → `TS CLI error: message`, exits 1
- Version: `hermes-fly 0.1.20` from `src/version.ts`

## 4. Command Registry

Nine commands registered via `program.command()`:

| Command | Handler | Options | Exit Codes |
|---------|---------|---------|-----------|
| `deploy` | `runDeployCommand` | `--channel <ch>`, `--no-auto-install` | 0, 1 |
| `resume` | `runResumeCommand` | passthrough args | 0, 1 |
| `list` | `runListCommand` | none | 0 |
| `status` | `runStatusCommand` | passthrough args | 0, 1 |
| `logs` | `runLogsCommand` | passthrough args | 0, 1 |
| `doctor` | `runDoctorCommand` | passthrough args | 0, 1 |
| `destroy` | `runDestroyCommand` | passthrough args | 0, 1, 4 |
| `help` | `runHelpCommand` | none | 0 |
| `version` | `runVersionCommand` | none | 0 |

Most commands use `allowUnknownOption(true)` and `allowExcessArguments(true)` to handle their own arg parsing internally (e.g., `-a APP` flag).

## 5. Command Module Pattern

Each `src/commands/*.ts` follows a consistent structure:

1. **Options interface**: declares injectable dependencies (use-case, stderr, configDir)
2. **Arg parser**: extracts `-a APP`, `--force`, etc. from raw string array
3. **Dependency assembly**: instantiates adapters → use-cases (inline, no DI container)
4. **Execution**: calls use-case, writes output to stderr, returns exit code

Example (`src/commands/status.ts`, 51 lines):
```typescript
export async function runStatusCommand(
  argv: string[] = [],
  opts?: Partial<StatusCommandOptions>,
): Promise<number> {
  const appName = resolveApp(argv, opts?.configDir);
  const useCase = opts?.useCase ?? new ShowStatusUseCase(/* adapter */);
  const result = await useCase.execute(appName);
  // write result to stderr, return exit code
}
```

## 6. App Resolution

`src/commands/resolve-app.ts` (39 lines) — shared by status, logs, doctor, destroy, resume:

**Resolution order:**
1. `-a <appName>` explicit flag → returns appName
2. `-a` with no value → returns `null` (signals "no app specified")
3. No `-a` flag → reads `current_app` from `~/.hermes-fly/config.yaml`
4. No config → returns `null`

Commands that receive `null` either error with guidance or handle gracefully (e.g., list ignores it).

## 7. Help System

`src/commands/help.ts` (37 lines):
- Commander's built-in help command is disabled (`program.helpCommand(false)`)
- Custom `runHelpCommand()` outputs formatted help to stderr
- Lists all commands with descriptions
- Includes usage examples and `-a APP` documentation

## 8. File Inventory

| File | Lines | Responsibility |
|------|-------|---------------|
| `hermes-fly` | 14 | Shell shim (symlink-aware, exec node) |
| `src/cli.ts` | 141 | Commander.js program, command registration |
| `src/version.ts` | 1 | Version constant (0.1.20) |
| `src/commands/deploy.ts` | 39 | Deploy command handler |
| `src/commands/resume.ts` | 41 | Resume command handler |
| `src/commands/list.ts` | 47 | List command handler |
| `src/commands/status.ts` | 51 | Status command handler |
| `src/commands/logs.ts` | 62 | Logs command handler |
| `src/commands/doctor.ts` | 51 | Doctor command handler |
| `src/commands/destroy.ts` | 84 | Destroy command handler (with --force) |
| `src/commands/help.ts` | 37 | Custom help output |
| `src/commands/version.ts` | 5 | Version output |
| `src/commands/resolve-app.ts` | 39 | Shared -a flag + config resolution |
