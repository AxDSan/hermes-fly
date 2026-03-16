# Maintainability

PSF for DDD conventions, architecture enforcement, naming patterns, and extension guides.

**Related PSFs**: [00-architecture](00-hermes-fly-architecture-overview.md) | [05-testing](05-testing-and-qa.md) | [09-security](09-security.md)

## 1. TL;DR

- **DDD layering**: domain → application → infrastructure, enforced by dependency-cruiser
- **Port/adapter pattern**: 14 port interfaces, all infrastructure behind abstractions
- **TypeScript strict mode**: `tsconfig.json` with `strict: true`, `noEmitOnError: true`
- **ESM-only**: `"type": "module"` with NodeNext resolution, `.js` extension imports
- **Extension patterns**: well-defined paths for new commands, contexts, and checks

## 2. Architecture Conventions

### Layer Rules

```
┌─────────────────────────────────────┐
│  Presentation (src/commands/)       │  Depends on: Application
│  - CLI arg parsing                  │  Must not: import infrastructure directly
│  - Dependency assembly              │
│  - Output formatting                │
├─────────────────────────────────────┤
│  Application (src/contexts/*/app/)  │  Depends on: Domain, Ports
│  - Use-cases (orchestration)        │  Must not: import adapters directly
│  - Port interfaces (contracts)      │
├─────────────────────────────────────┤
│  Domain (src/contexts/*/domain/)    │  Depends on: nothing
│  - Entities, value objects          │  Must not: import infrastructure,
│  - Validation logic                 │    presentation, or legacy
├─────────────────────────────────────┤
│  Infrastructure (src/contexts/*/    │  Implements: Ports
│    infrastructure/)                 │  Depends on: cross-cutting adapters
│  - Fly CLI adapters                 │
│  - File I/O, config parsing         │
└─────────────────────────────────────┘
```

### Dependency-Cruiser Rules

`dependency-cruiser.cjs` enforces three forbidden patterns:

| Rule | What's Forbidden | Why |
|------|-----------------|-----|
| Domain purity | `domain/` → `infrastructure/` or `presentation/` | Domain must be framework-agnostic |
| Legacy isolation | `domain/` → `legacy/` | Domain must not depend on bash bridge |
| Process containment | `node:child_process` imports except in `process.ts` and `bash-bridge.ts` | All external process calls go through ProcessRunner |

Run: `npm run arch:ddd-boundaries`

## 3. Naming Conventions

### Files
| Pattern | Example | Location |
|---------|---------|----------|
| `kebab-case.ts` | `deployment-intent.ts` | All TypeScript files |
| `*.port.ts` | `deploy-wizard.port.ts` | Port interfaces |
| `*.test.ts` | `show-status.test.ts` | Test files |
| `fly-*.ts` | `fly-deploy-runner.ts` | Fly.io adapter implementations |

### Code
| Pattern | Example | Usage |
|---------|---------|-------|
| `PascalCase` | `DeploymentIntent`, `RunDoctorUseCase` | Classes, interfaces, types |
| `camelCase` | `runDeployCommand`, `readCurrentApp` | Functions, methods, variables |
| `SCREAMING_SNAKE` | `HERMES_FLY_TS_VERSION` | Constants |
| `*UseCase` suffix | `RunDeployWizardUseCase` | Use-case classes |
| `*Port` suffix | `DeployWizardPort` | Port interfaces |
| `Fly*` prefix | `FlyDeployRunner` | Fly.io adapter implementations |

### Directory Structure per Context
```
src/contexts/<name>/
├── domain/           # Entities, value objects (no dependencies)
├── application/
│   ├── ports/        # Interface contracts (*.port.ts)
│   └── use-cases/    # Orchestration logic
├── infrastructure/
│   └── adapters/     # Concrete implementations (fly-*.ts)
└── presentation/     # (reserved, currently unused — commands are in src/commands/)
```

## 4. TypeScript Configuration

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": "src",
    "outDir": "dist",
    "strict": true,
    "noEmitOnError": true,
    "skipLibCheck": true
  }
}
```

Key choices:
- **ES2022**: native async/await, class fields, top-level await
- **NodeNext**: ESM with `.js` extensions in import paths (TypeScript convention)
- **strict**: enables all strict type-checking options
- **noEmitOnError**: prevents generating broken JS if types fail

## 5. Extension Patterns

### Adding a New Command

1. Create `src/commands/newcmd.ts` with `runNewCmdCommand()` function
2. Register in `src/cli.ts`: `program.command("newcmd").action(...)`
3. Create use-case in appropriate bounded context
4. Add tests in `tests-ts/runtime/newcmd-command.test.ts`

### Adding a New Bounded Context

1. Create directory: `src/contexts/newcontext/{domain,application/{ports,use-cases},infrastructure/adapters}`
2. Define domain entities in `domain/`
3. Define port interfaces in `application/ports/`
4. Implement use-cases in `application/use-cases/`
5. Implement adapters in `infrastructure/adapters/`
6. dependency-cruiser rules apply automatically to the new context

### Adding a Doctor Check

1. Add method to `DoctorChecksPort` interface (`src/contexts/diagnostics/application/ports/doctor-checks.port.ts`)
2. Implement in `FlyDoctorChecks` adapter (`src/contexts/diagnostics/infrastructure/adapters/fly-doctor-checks.ts`)
3. Call from `RunDoctorUseCase` (`src/contexts/diagnostics/application/use-cases/run-doctor.ts`)
4. Add test in `tests-ts/diagnostics/run-doctor.test.ts`

### Adding a New LLM Provider

1. Extend config collection in `FlyDeployWizard` adapter
2. Add secret mapping in `FlyDeployRunner`
3. Update `DeploymentIntent` validation if new fields needed
4. Add doctor check for provider-specific connectivity

## 6. Build Pipeline

```bash
npm run build          # tsc → dist/
npm run typecheck      # tsc --noEmit (type check only)
npm run arch:ddd-boundaries  # dependency-cruiser validation
```

Output: `dist/` directory mirrors `src/` structure with compiled `.js` files. The shell shim `hermes-fly` points to `dist/cli.js`.

## 7. Technical Debt

| Issue | Impact | Location |
|-------|--------|----------|
| Legacy bridge not integrated | Fallback to bash not available | `src/legacy/` |
| Archived bash modules | 14 files maintained for reference only | `lib/archive/` |
| Template sed substitution | Fragile string replacement | `TemplateWriter` adapter |
| No DI container | Dependency graphs assembled manually in commands | `src/commands/*.ts` |
| Config YAML parsing | Manual string parsing, not a YAML library | Config adapters |

## 8. Dependencies

| Package | Version | Purpose | Dev? |
|---------|---------|---------|------|
| commander | ^12.1.0 | CLI argument parsing | No |
| typescript | ^5.8.2 | TypeScript compiler | Yes |
| tsx | ^4.20.5 | Test runner (node --test with TS) | Yes |
| dependency-cruiser | ^16.8.0 | Architecture boundary enforcement | Yes |
