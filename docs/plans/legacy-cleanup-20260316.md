# Legacy Cleanup Plan — Remove Bash Artifacts After TypeScript Transition

**Date**: 2026-03-16
**Status**: READY
**Risk Level**: LOW (all targets are already unused/broken)
**Estimated Slices**: 4
**Credentials**: No credentials, API keys, tokens, or secrets are required for any step in this plan. All operations are local file deletions, builds, and test runs.

---

## Objective

Safely remove three categories of legacy Bash artifacts that remain after the completed TypeScript Commander.js transition (PR #12):

1. **Legacy bridge contracts** (`src/legacy/`, `LegacyCommandRunnerPort`) — defined but never imported or called
2. **Archived bash modules** (`lib/archive/`) — 14 files, no longer on execution path
3. **Legacy BATS tests** — 15 already-broken tests + 3 hybrid parity tests with broken bash legs

**In scope**: Deletion of dead code, build config updates, PSF doc updates, test retirement.
**Out of scope**: New feature work, TS test additions, production deployments, CI/CD pipeline changes, and edits to external non-repo files (including `~/.claude/**` memory files).

## Execution Context, Prerequisites, and Credentials

Execution context:

1. Repository root: `/Users/alex/Documents/GitHub/hermes-fly/.claude/worktrees/logical-leaping-plum`
2. Run all commands from repository root unless a command explicitly sets another path.
3. Create and use a dedicated branch for this cleanup:
   - `git checkout -b chore/legacy-cleanup-20260316` (or reuse the same branch name if it already exists).

Tooling prerequisites:

1. Required local tools: `bash`, `git`, `npm`, `node`, `rg`, `grep`, `sed`, `awk`, `comm`, `sort`, `wc`.
2. Required npm dependencies must already be installed (`node_modules/` present).

Credential readiness:

1. No credentials are required for this cleanup.
2. Do not create, commit, or print any plaintext secrets.
3. If local environment variables such as `OPENROUTER_API_KEY` exist, they are optional for this cleanup and must not be echoed in logs.

Preflight command:

```bash
cd /Users/alex/Documents/GitHub/hermes-fly/.claude/worktrees/logical-leaping-plum
bash -euo pipefail -c '
  test -d .git
  git rev-parse --abbrev-ref HEAD >/dev/null
  command -v npm >/dev/null
  command -v node >/dev/null
  command -v rg >/dev/null
  mkdir -p tmp/verification/legacy-cleanup
'
```

Expected exit code: `0`  
Expected artifacts:
- `tmp/verification/legacy-cleanup/` directory exists.

## Resolved Questions

These were investigated during plan creation and are now decided:

1. **`tests/install.bats`**: Sources only `scripts/install.sh` (not any lib/ module). `scripts/install.sh` has zero references to `lib/`. All 16 tests pass. **Decision: KEEP.**

2. **Reasoning module**: `lib/archive/reasoning.sh` provides reasoning effort compatibility gating. The TS codebase partially ported this — `src/contexts/deploy/domain/provenance-record.ts` has a `reasoningEffort` field with validation. The full compatibility snapshot/gating logic was not ported. **Decision: Intentional scope reduction. Safe to remove broken test. No tech debt entry needed — the TS domain entity covers the core use case.**

3. **`scripts/verify-pr-a2-ddd-boundaries.sh`**: This PR-specific script checks .gitkeep files exist and runs dependency-cruiser. It duplicates `npm run arch:ddd-boundaries` for the ongoing check. The .gitkeep existence checks are one-time PR validation. **Decision: REMOVE.**

4. **`scripts/verify-pr-b1-domain-primitives.sh`**: This PR-specific script checks domain entity files exist and runs `tsx --test` on primitives. It duplicates `npm run test:domain-primitives`. **Decision: REMOVE.**

## Current State Assessment

### Legacy Bridge (src/legacy/)

| File | Lines | Imports From | Imported By |
|------|-------|-------------|-------------|
| `src/legacy/bash-bridge.ts` | 11 | nothing | **nothing** |
| `src/legacy/bash-bridge-contract.ts` | 17 | nothing | `legacy-command-runner.port.ts` only |
| `src/contexts/runtime/application/ports/legacy-command-runner.port.ts` | 8 | `bash-bridge-contract.ts` | **nothing** |

**Verdict**: Completely orphaned. Zero references from any command, use-case, or adapter.

**dependency-cruiser.cjs** references (file is 39 lines):
- Line 13: Rule `no-domain-to-legacy` forbids domain → `src/legacy/` imports
- Line 25-26: Rule `only-bash-bridge-can-import-child-process` allows `src/legacy/bash-bridge.ts` to import `node:child_process`
- Both rules must be updated when removing legacy/

### Archived Bash Modules (lib/archive/)

14 files, all in `lib/archive/`:
```
config.sh    deploy.sh    destroy.sh    docker-helpers.sh
doctor.sh    fly-helpers.sh    list.sh    logs.sh
messaging.sh    openrouter.sh    prereqs.sh    reasoning.sh
status.sh    ui.sh
```

**Key finding**: `lib/` contains ONLY the `archive/` subdirectory. No `.sh` files exist at the `lib/*.sh` level. This means:
- Legacy BATS tests that `source "${PROJECT_ROOT}/lib/config.sh"` are **already broken** (file not found)
- The 3 parity scripts in `scripts/` also reference these paths and are broken or use `lib/archive/` explicitly

**External references to lib/ or lib/archive/**:

| Referencing File | Reference Path | Status |
|-----------------|---------------|--------|
| `scripts/parity-capture.sh:45` | `source "$REPO_ROOT/lib/config.sh"` | **BROKEN** (file doesn't exist) |
| `scripts/verify-pr-d1-list-command.sh:642,654` | `source ./lib/config.sh` | **BROKEN** |
| `scripts/verify-pr-d2-status-logs.sh:80,94` | `source ./lib/archive/config.sh` | Works (references archive directly) |
| `scripts/verify-pr-full-commander.sh:114` | Asserts hermes-fly does NOT source lib/*.sh | Negative assertion — works correctly |
| 15 BATS test files | `source "${PROJECT_ROOT}/lib/*.sh"` | **ALL BROKEN** |
| 3 hybrid BATS tests | Mixed lib/ and lib/archive/ | **PARTIALLY BROKEN** |

### Legacy BATS Tests

**Confirmed broken** (tested — all fail with "No such file or directory"):

#### Category A: Pure Legacy Tests (15 files — ALL BROKEN, DELETE)

Source `lib/*.sh` which doesn't exist. Every test case fails.

| Test File | Tests | Modules Sourced |
|-----------|-------|----------------|
| `tests/config.bats` | 18 | config.sh |
| `tests/deploy.bats` | ~134 | ui, fly-helpers, docker-helpers, messaging, config, status, reasoning, deploy |
| `tests/destroy.bats` | ~20 | ui, fly-helpers, config, destroy |
| `tests/docker-helpers.bats` | ~15 | docker-helpers |
| `tests/doctor.bats` | ~50 | ui, fly-helpers, doctor |
| `tests/fly-helpers.bats` | ~30 | fly-helpers |
| `tests/list.bats` | ~15 | ui, fly-helpers, config, list |
| `tests/logs.bats` | ~5 | ui, fly-helpers, logs |
| `tests/messaging.bats` | ~20 | ui, messaging |
| `tests/openrouter.bats` | ~40 | ui, openrouter |
| `tests/prereqs.bats` | ~76 | ui, prereqs |
| `tests/prereqs_edge_cases.bats` | ~57 | ui, prereqs |
| `tests/reasoning.bats` | ~45 | ui, reasoning |
| `tests/status.bats` | ~10 | ui, fly-helpers, status |
| `tests/ui.bats` | ~14 | ui |

#### Category B: Hybrid Parity Tests (3 files — PARTIALLY BROKEN, DELETE)

| Test File | Broken Tests | Working Tests |
|-----------|-------------|---------------|
| `tests/list-ts-hybrid.bats` | Tests sourcing `lib/config.sh` | Tests comparing TS output only |
| `tests/status-ts-hybrid.bats` | Tests sourcing `lib/archive/config.sh` | TS-only tests |
| `tests/logs-ts-hybrid.bats` | Tests sourcing `lib/archive/config.sh` | TS-only tests |

#### Category C: Dependent on Scripts (5 files — CO-DELETE with scripts in Slice 2)

These BATS tests invoke scripts being removed in Slice 2 and will break without them:

| Test File | Script Dependency | Decision |
|-----------|------------------|----------|
| `tests/verify-pr-d1-list-command.bats` | `scripts/verify-pr-d1-list-command.sh` | REMOVE in Slice 2 |
| `tests/verify-pr-d1-report-content.bats` | `scripts/verify-pr-d1-report-content.sh` | REMOVE in Slice 2 |
| `tests/verify-pr-d2-status-logs.bats` | `scripts/verify-pr-d2-status-logs.sh` | REMOVE in Slice 2 |
| `tests/verify-pr-full-commander.bats` | `scripts/verify-pr-full-commander.sh` | REMOVE in Slice 2 |
| `tests/parity-harness.bats` | `scripts/parity-capture.sh`, `scripts/parity-compare.sh`, `tests/parity/` | REMOVE in Slice 2 |

#### Category D: Independent TS-Focused Tests (9 files — KEEP)

No bash module or removed-script dependencies:

| Test File | Status | Notes |
|-----------|--------|-------|
| `tests/deploy-ts.bats` | Pass | TS-only |
| `tests/destroy-ts.bats` | Pass | TS-only |
| `tests/doctor-ts.bats` | Pass | TS-only |
| `tests/resume-ts.bats` | Pass | TS-only |
| `tests/hybrid-dispatch.bats` | Pass | Validates TS is primary runtime |
| `tests/integration.bats` | Pass | TS-only |
| `tests/release-guard.bats` | Pass | Version validation (uses scripts/release-guard.sh — KEPT) |
| `tests/scaffold.bats` | Pass | Test helpers |
| `tests/install.bats` | Pass | Tests scripts/install.sh (KEPT), no lib/ deps |

### Scripts

| Script | Decision | Reason |
|--------|----------|--------|
| `scripts/parity-capture.sh` | REMOVE | Broken (sources lib/config.sh), parity proven |
| `scripts/parity-compare.sh` | REMOVE | Companion to parity-capture, no standalone use |
| `scripts/verify-pr-d1-list-command.sh` | REMOVE | PR #11 artifact, broken references |
| `scripts/verify-pr-d1-report-content.sh` | REMOVE | PR #11 artifact |
| `scripts/verify-pr-d2-status-logs.sh` | REMOVE | PR #11 artifact |
| `scripts/verify-pr-full-commander.sh` | REMOVE | PR #12 artifact, already merged |
| `scripts/verify-pr-a1-foundation.sh` | REMOVE | PR-specific one-time verification |
| `scripts/verify-pr-a2-ddd-boundaries.sh` | REMOVE | Duplicates `npm run arch:ddd-boundaries` |
| `scripts/verify-pr-b1-domain-primitives.sh` | REMOVE | Duplicates `npm run test:domain-primitives` |
| `scripts/verify-pr-c1-parity-harness.sh` | REMOVE | Parity infrastructure being retired |
| `scripts/release-guard.sh` | **KEEP** | Active release validation |
| `scripts/bootstrap.sh` | **KEEP** | Project setup |
| `scripts/install.sh` | **KEEP** | User-facing install script |

### Test Infrastructure

| Directory | Decision | Reason |
|-----------|----------|--------|
| `tests/mocks/fly` | **KEEP** | Used by kept BATS tests (deploy-ts, destroy-ts, doctor-ts, etc.) via common-setup.bash PATH prepend |
| `tests/mocks/curl` | **KEEP** | Used by kept BATS tests and install.bats |
| `tests/mocks/git` | **KEEP** | Used by install.bats |
| `tests/mocks/mock-fail-gracefully` | **KEEP** | Test utility |
| `tests/mocks/apt-get` | REMOVE | Only used by deleted prereqs.bats and prereqs_edge_cases.bats |
| `tests/mocks/brew` | REMOVE | Only used by deleted prereqs.bats |
| `tests/mocks/sudo` | REMOVE | Only used by deleted prereqs.bats |
| `tests/mocks/xcode-select` | REMOVE | Only used by deleted prereqs.bats |
| `tests/test_helper/` | **KEEP** | bats-support, bats-assert, common-setup.bash — used by all kept BATS tests |
| `tests/bats/` | **KEEP** | Vendored BATS framework |
| `tests/parity/` | REMOVE | Baselines for retired parity system |

---

## Execution Plan

### Pre-Execution Gate: Full TS Test Suite Verification

Before any deletion, run the complete TypeScript test suite to establish a green baseline.

**Gate commands** (all must exit 0):
```bash
npm run build
npm run arch:ddd-boundaries
npm run test:domain-primitives
npm run test:runtime-list
npm run test:runtime-status
npm run test:runtime-logs
npm run test:runtime-cli-contracts
npm run test:runtime-resolve-app-parity
npm run test:runtime-doctor
npm run test:runtime-destroy
npm run test:runtime-resume
npm run test:runtime-deploy
npm run test:deploy-resolve-target-app
npm run test:deploy-resume-deployment-checks
npm run test:deploy-run-wizard
npm run test:deploy-provision
npm run test:diagnostics-run-doctor
npm run test:release-destroy-deployment
```

**Gate criteria**: Every command above exits 0. If any fails, stop and fix before proceeding.

---

### Slice 1: Remove Legacy Bridge Contracts

**Risk**: MINIMAL — zero production references.

#### Step 1.1: Delete legacy TypeScript files

Delete these 3 files:
```
rm src/legacy/bash-bridge.ts
rm src/legacy/bash-bridge-contract.ts
rm src/contexts/runtime/application/ports/legacy-command-runner.port.ts
```

#### Step 1.2: Remove the src/legacy/ directory

```bash
rm -rf src/legacy/
```

The `src/contexts/runtime/application/ports/` directory retains 4 other port files (`deployment-registry.port.ts`, `logs-reader.port.ts`, `status-reader.port.ts`, `legacy-command-runner.port.ts` was the only deletion). No .gitkeep cleanup needed in that directory.

#### Step 1.3: Update dependency-cruiser.cjs

The current file content (39 lines) must be edited as follows.

**DELETE lines 12-18** (the entire `no-domain-to-legacy` rule object):
```javascript
    {
      name: "no-domain-to-legacy",
      severity: "error",
      comment: "Domain modules cannot import legacy bridge/runtime modules.",
      from: { path: "^src/contexts/[^/]+/domain/" },
      to: { path: "^src/legacy/" }
    },
```

**EDIT line 25-26** in the `only-bash-bridge-can-import-child-process` rule:

Before:
```javascript
      from: {
        pathNot:
          "^(src/legacy/bash-bridge\\.ts|src/adapters/process\\.ts)$"
      },
```

After:
```javascript
      from: {
        pathNot: "^src/adapters/process\\.ts$"
      },
```

Also update the rule `name` (line 20) and `comment` (lines 22-23):

Before:
```javascript
      name: "only-bash-bridge-can-import-child-process",
      severity: "error",
      comment:
        "Only bash-bridge and process adapter may use child_process directly.",
```

After:
```javascript
      name: "only-process-adapter-can-import-child-process",
      severity: "error",
      comment:
        "Only the process adapter may use child_process directly.",
```

#### Step 1.4: Verify

| Check ID | Command | Expected Exit Code | Pass Criteria |
|----------|---------|-------------------|---------------|
| V1.1 | `npm run build` | 0 | Compiles with zero errors |
| V1.2 | `npm run arch:ddd-boundaries` | 0 | Zero violations |
| V1.3 | `test ! -d src/legacy/` | 0 | Directory does not exist |
| V1.4 | `test ! -f src/contexts/runtime/application/ports/legacy-command-runner.port.ts` | 0 | File does not exist |
| V1.5 | `grep -rn 'bash-bridge\|LegacyCommand\|BashFallback' src/ ; echo "EXIT:$?"` | grep exits 1 (no matches) | Zero output lines, grep exit code 1 |
| V1.6 | `npm run test:runtime-cli-contracts` | 0 | All tests pass |
| V1.7 | `npm run test:domain-primitives` | 0 | All tests pass |
| V1.8 | `node dist/cli.js --version` | 0 | Prints `hermes-fly 0.1.20` |

#### Step 1.5: Commit

Commit message: `chore: remove unused legacy bash-bridge contracts and LegacyCommandRunnerPort`

---

### Slice 2: Remove Parity/Verification Scripts and Dependent BATS Tests

**Risk**: LOW — these scripts serve already-merged PRs and/or are already broken.

#### Step 2.1: Delete verification scripts (10 files)

```bash
rm scripts/parity-capture.sh
rm scripts/parity-compare.sh
rm scripts/verify-pr-a1-foundation.sh
rm scripts/verify-pr-a2-ddd-boundaries.sh
rm scripts/verify-pr-b1-domain-primitives.sh
rm scripts/verify-pr-c1-parity-harness.sh
rm scripts/verify-pr-d1-list-command.sh
rm scripts/verify-pr-d1-report-content.sh
rm scripts/verify-pr-d2-status-logs.sh
rm scripts/verify-pr-full-commander.sh
```

#### Step 2.2: Delete BATS tests that depend on removed scripts (5 files)

These BATS tests invoke the scripts deleted in Step 2.1 and will fail without them:

```bash
rm tests/verify-pr-d1-list-command.bats
rm tests/verify-pr-d1-report-content.bats
rm tests/verify-pr-d2-status-logs.bats
rm tests/verify-pr-full-commander.bats
rm tests/parity-harness.bats
```

#### Step 2.3: Remove parity test infrastructure

```bash
rm -rf tests/parity/
```

#### Step 2.4: Remove npm scripts from package.json

Remove these 5 script entries from the `"scripts"` object in `package.json`:

```json
"parity:capture": "bash scripts/parity-capture.sh --out-dir tests/parity/current",
"parity:compare": "bash scripts/parity-compare.sh --baseline tests/parity/baseline --candidate tests/parity/current",
"parity:check": "npm run parity:capture && npm run parity:compare",
"verify:pr-d1-list-command": "bash scripts/verify-pr-d1-list-command.sh",
"verify:pr-d2-status-logs": "bash scripts/verify-pr-d2-status-logs.sh"
```

#### Step 2.5: Verify

| Check ID | Command | Expected Exit Code | Pass Criteria |
|----------|---------|-------------------|---------------|
| V2.1 | `ls scripts/` | 0 | Only 3 files remain: `bootstrap.sh`, `install.sh`, `release-guard.sh` |
| V2.2 | `test ! -d tests/parity/` | 0 | Directory does not exist |
| V2.3 | `npm run build` | 0 | Compiles with zero errors |
| V2.4 | `npm run arch:ddd-boundaries` | 0 | Zero violations |
| V2.5 | `npm run test:domain-primitives` | 0 | All tests pass |
| V2.6 | `npm run test:runtime-list` | 0 | All tests pass |
| V2.7 | `npm run test:runtime-status` | 0 | All tests pass |
| V2.8 | `npm run test:runtime-logs` | 0 | All tests pass |
| V2.9 | `npm run test:runtime-cli-contracts` | 0 | All tests pass |
| V2.10 | `npm run test:runtime-resolve-app-parity` | 0 | All tests pass |
| V2.11 | `npm run test:runtime-doctor` | 0 | All tests pass |
| V2.12 | `npm run test:runtime-destroy` | 0 | All tests pass |
| V2.13 | `npm run test:runtime-resume` | 0 | All tests pass |
| V2.14 | `npm run test:runtime-deploy` | 0 | All tests pass |
| V2.15 | `npm run test:deploy-resolve-target-app` | 0 | All tests pass |
| V2.16 | `npm run test:deploy-resume-deployment-checks` | 0 | All tests pass |
| V2.17 | `npm run test:deploy-run-wizard` | 0 | All tests pass |
| V2.18 | `npm run test:deploy-provision` | 0 | All tests pass |
| V2.19 | `npm run test:diagnostics-run-doctor` | 0 | All tests pass |
| V2.20 | `npm run test:release-destroy-deployment` | 0 | All tests pass |
| V2.21 | `./tests/bats/bin/bats tests/deploy-ts.bats tests/destroy-ts.bats tests/doctor-ts.bats tests/resume-ts.bats tests/hybrid-dispatch.bats tests/release-guard.bats tests/scaffold.bats tests/install.bats tests/integration.bats` | 0 | All kept BATS tests pass |
| V2.22 | `grep -c 'parity' package.json` | output is `0` | No parity references remain in package.json |
| V2.23 | `node dist/cli.js --version` | 0 | Prints `hermes-fly 0.1.20` |

#### Step 2.6: Commit

Commit message: `chore: remove legacy parity scripts and PR-specific verification artifacts`

---

### Slice 3: Retire Legacy BATS Tests

**Risk**: LOW — all 15 legacy tests are already broken (confirmed: all fail with "No such file or directory"). All 3 hybrid tests have broken bash legs.

#### Step 3.1: Confidence verification — coverage cross-reference

The following table documents that every retired legacy BATS test has TypeScript equivalent coverage:

| Legacy BATS Test | TS Equivalent | Coverage |
|-----------------|---------------|----------|
| `tests/config.bats` (18 tests) | `tests-ts/runtime/list-deployments.test.ts` | YAML read/write/dedup |
| `tests/deploy.bats` (134 tests) | `tests-ts/deploy/run-deploy-wizard.test.ts` + `tests-ts/deploy/provision-deployment.test.ts` + `tests-ts/runtime/deploy-command.test.ts` | All 6 phases |
| `tests/destroy.bats` (20 tests) | `tests-ts/release/destroy-deployment.test.ts` + `tests-ts/runtime/destroy-command.test.ts` | Destroy flow + --force |
| `tests/doctor.bats` (50 tests) | `tests-ts/diagnostics/run-doctor.test.ts` + `tests-ts/runtime/doctor-command.test.ts` | 8 checks |
| `tests/fly-helpers.bats` (30 tests) | `tests-ts/runtime/show-status.test.ts` + `tests-ts/runtime/show-logs.test.ts` | Fly CLI wrapping |
| `tests/list.bats` (15 tests) | `tests-ts/runtime/list-deployments.test.ts` | List + registry |
| `tests/logs.bats` (5 tests) | `tests-ts/runtime/show-logs.test.ts` | Logs + streaming |
| `tests/status.bats` (10 tests) | `tests-ts/runtime/show-status.test.ts` | Status parsing |
| `tests/ui.bats` (14 tests) | Covered by all `tests-ts/runtime/*-command.test.ts` files (commands inject stderr writers) | Output formatting |
| `tests/messaging.bats` (20 tests) | Messaging is env-var driven in TS; `tests-ts/deploy/run-deploy-wizard.test.ts` covers config collection | Policy validation |
| `tests/openrouter.bats` (40 tests) | OpenRouter is in deploy wizard adapter; `tests-ts/deploy/run-deploy-wizard.test.ts` covers collection | Config collection |
| `tests/prereqs.bats` (76 tests) | Prereqs are in `FlyDeployWizard.checkPrerequisites()`; `tests-ts/deploy/run-deploy-wizard.test.ts` covers | Platform detection |
| `tests/prereqs_edge_cases.bats` (57 tests) | Same as above | Edge cases |
| `tests/reasoning.bats` (45 tests) | Reasoning effort is a field in `ProvenanceRecord`; `tests-ts/domain/primitives.test.ts` validates it. Full gating logic was intentionally not ported — see Resolved Questions. | Partial (intentional) |
| `tests/docker-helpers.bats` (15 tests) | Docker checks in `FlyDeployWizard`; `tests-ts/deploy/run-deploy-wizard.test.ts` | Prerequisite checks |

#### Step 3.2: Delete legacy BATS tests (15 files, Category A)

```bash
rm tests/config.bats
rm tests/deploy.bats
rm tests/destroy.bats
rm tests/docker-helpers.bats
rm tests/doctor.bats
rm tests/fly-helpers.bats
rm tests/list.bats
rm tests/logs.bats
rm tests/messaging.bats
rm tests/openrouter.bats
rm tests/prereqs.bats
rm tests/prereqs_edge_cases.bats
rm tests/reasoning.bats
rm tests/status.bats
rm tests/ui.bats
```

#### Step 3.3: Delete hybrid parity tests (3 files, Category B)

Parity is proven by: merged PR #12, passing TS tests, and the bash legs of these tests are already broken.

```bash
rm tests/list-ts-hybrid.bats
rm tests/status-ts-hybrid.bats
rm tests/logs-ts-hybrid.bats
```

#### Step 3.4: Delete orphaned mock files (4 files)

These mocks are only used by the deleted prereqs tests:
```bash
rm tests/mocks/apt-get
rm tests/mocks/brew
rm tests/mocks/sudo
rm tests/mocks/xcode-select
```

Kept mocks: `fly`, `curl`, `git`, `mock-fail-gracefully` (used by remaining BATS tests via common-setup.bash PATH prepend).

#### Step 3.5: Verify

| Check ID | Command | Expected Exit Code | Pass Criteria |
|----------|---------|-------------------|---------------|
| V3.1 | `ls tests/*.bats \| wc -l` | 0 | Outputs `9` (the 9 kept Category D tests) |
| V3.2 | `ls tests/mocks/` | 0 | Shows exactly: `curl`, `fly`, `git`, `mock-fail-gracefully` |
| V3.3 | `npm run build` | 0 | Compiles without errors |
| V3.4 | `npm run test:domain-primitives` | 0 | All tests pass |
| V3.5 | `npm run test:runtime-list` | 0 | All tests pass |
| V3.6 | `npm run test:runtime-status` | 0 | All tests pass |
| V3.7 | `npm run test:runtime-logs` | 0 | All tests pass |
| V3.8 | `npm run test:runtime-cli-contracts` | 0 | All tests pass |
| V3.9 | `npm run test:runtime-resolve-app-parity` | 0 | All tests pass |
| V3.10 | `npm run test:runtime-doctor` | 0 | All tests pass |
| V3.11 | `npm run test:runtime-destroy` | 0 | All tests pass |
| V3.12 | `npm run test:runtime-resume` | 0 | All tests pass |
| V3.13 | `npm run test:runtime-deploy` | 0 | All tests pass |
| V3.14 | `npm run test:deploy-resolve-target-app` | 0 | All tests pass |
| V3.15 | `npm run test:deploy-resume-deployment-checks` | 0 | All tests pass |
| V3.16 | `npm run test:deploy-run-wizard` | 0 | All tests pass |
| V3.17 | `npm run test:deploy-provision` | 0 | All tests pass |
| V3.18 | `npm run test:diagnostics-run-doctor` | 0 | All tests pass |
| V3.19 | `npm run test:release-destroy-deployment` | 0 | All tests pass |
| V3.20 | `./tests/bats/bin/bats tests/deploy-ts.bats tests/destroy-ts.bats tests/doctor-ts.bats tests/resume-ts.bats tests/hybrid-dispatch.bats tests/release-guard.bats tests/scaffold.bats tests/install.bats tests/integration.bats` | 0 | All 9 kept BATS tests pass |
| V3.21 | `node dist/cli.js --version` | 0 | Prints `hermes-fly 0.1.20` |
| V3.22 | `node dist/cli.js help` | 0 | Prints help text with command list |
| V3.23 | `node dist/cli.js list` | 0 | Runs without crash (may show empty list or tracked apps) |

#### Step 3.6: Commit

Commit message: `chore: retire broken legacy BATS tests — TS test suite provides equivalent coverage`

---

### Slice 4: Remove Archived Bash Modules and Clean Up

**Risk**: LOW — modules are already in archive/ and not on execution path.

**Prerequisite**: Slices 1-3 must be completed first (all references removed).

#### Step 4.1: Final reference check

Before deletion, verify zero remaining references:
```bash
grep -rn 'lib/archive\|lib/config\.sh\|lib/ui\.sh\|lib/deploy\.sh' \
  --include='*.ts' --include='*.sh' --include='*.bats' --include='*.json' \
  . | grep -v 'docs/' | grep -v 'node_modules/' | grep -v '.git/'
```

**Expected output**: No output (zero matches). If any results appear, stop the slice immediately and treat it as a hard failure; do not continue to Step 4.2 until all listed matches are removed and the command returns zero matches.

#### Step 4.2: Delete lib/ directory

```bash
rm -rf lib/
```

This removes 14 archived bash modules (~3,563 lines total):
- `lib/archive/config.sh`, `lib/archive/deploy.sh`, `lib/archive/destroy.sh`
- `lib/archive/docker-helpers.sh`, `lib/archive/doctor.sh`, `lib/archive/fly-helpers.sh`
- `lib/archive/list.sh`, `lib/archive/logs.sh`, `lib/archive/messaging.sh`
- `lib/archive/openrouter.sh`, `lib/archive/prereqs.sh`, `lib/archive/reasoning.sh`
- `lib/archive/status.sh`, `lib/archive/ui.sh`

#### Step 4.3: Update PSF documentation

**`docs/psf/00-hermes-fly-architecture-overview.md`**:
- Delete "## 7. Legacy Context" section (lines referencing `lib/archive/`, bash-bridge, BATS parity)
- Update metrics table: set "TypeScript source files" from `57` to `54` and set "BATS test files" to `9` (do not remove the row)

**`docs/psf/06-cross-cutting-infrastructure.md`**:
- Delete "## 5. Legacy Bridge" section entirely
- Delete "## 7. Archived Bash Modules" section entirely

**`docs/psf/08-maintainability.md`**:
- In the "## 7. Technical Debt" table: remove the row about "Legacy bridge not integrated"
- In the "## 7. Technical Debt" table: remove the row about "Archived bash modules"
- In the "## 3. Dependency-Cruiser Rules" section: update wording to reflect that only 2 rules remain (not 3), and remove any mention of `no-domain-to-legacy`

#### Step 4.4: Worktree-only boundary

Do not edit external non-repo files in this plan.  
Specifically, `~/.claude/projects/-Users-alex-Documents-GitHub-hermes-fly/memory/MEMORY.md` is out of scope for this implementation plan because execution must remain worktree-only.

#### Step 4.5: Verify

| Check ID | Command | Expected Exit Code | Pass Criteria |
|----------|---------|-------------------|---------------|
| V4.1 | `test ! -d lib/` | 0 | Directory does not exist |
| V4.2 | `grep -rn 'lib/archive' --include='*.ts' --include='*.sh' --include='*.bats' --include='*.json' . \| grep -v docs/ \| grep -v node_modules/ \| grep -v .git/ \| wc -l` | 0 | Output is `0` |
| V4.3 | `npm run build` | 0 | Compiles without errors |
| V4.4 | `npm run arch:ddd-boundaries` | 0 | Zero violations |
| V4.5 | `npm run test:domain-primitives` | 0 | All tests pass |
| V4.6 | `npm run test:runtime-list` | 0 | All tests pass |
| V4.7 | `npm run test:runtime-status` | 0 | All tests pass |
| V4.8 | `npm run test:runtime-logs` | 0 | All tests pass |
| V4.9 | `npm run test:runtime-cli-contracts` | 0 | All tests pass |
| V4.10 | `npm run test:runtime-resolve-app-parity` | 0 | All tests pass |
| V4.11 | `npm run test:runtime-doctor` | 0 | All tests pass |
| V4.12 | `npm run test:runtime-destroy` | 0 | All tests pass |
| V4.13 | `npm run test:runtime-resume` | 0 | All tests pass |
| V4.14 | `npm run test:runtime-deploy` | 0 | All tests pass |
| V4.15 | `npm run test:deploy-resolve-target-app` | 0 | All tests pass |
| V4.16 | `npm run test:deploy-resume-deployment-checks` | 0 | All tests pass |
| V4.17 | `npm run test:deploy-run-wizard` | 0 | All tests pass |
| V4.18 | `npm run test:deploy-provision` | 0 | All tests pass |
| V4.19 | `npm run test:diagnostics-run-doctor` | 0 | All tests pass |
| V4.20 | `npm run test:release-destroy-deployment` | 0 | All tests pass |
| V4.21 | `./tests/bats/bin/bats tests/deploy-ts.bats tests/destroy-ts.bats tests/doctor-ts.bats tests/resume-ts.bats tests/hybrid-dispatch.bats tests/release-guard.bats tests/scaffold.bats tests/install.bats tests/integration.bats` | 0 | All 9 kept BATS tests pass |
| V4.22 | `node dist/cli.js --version` | 0 | Prints `hermes-fly 0.1.20` |
| V4.23 | `node dist/cli.js help` | 0 | Prints help text |
| V4.24 | `node dist/cli.js list` | 0 | Runs without crash |

#### Step 4.6: Commit

Commit message: `chore: remove archived bash modules and clean up test infrastructure`

---

## Deterministic Verification Protocol (Authoritative)

This section is the authoritative verification contract for implementation readiness.  
The per-slice verification tables above remain useful references, but this section defines the required gate checks and artifacts.

Run once before verification:

```bash
cd /Users/alex/Documents/GitHub/hermes-fly/.claude/worktrees/logical-leaping-plum
mkdir -p tmp/verification/legacy-cleanup
```

### VC0 - Context and credential readiness

Purpose:
- Prove execution context is correct and no credentials are required for this plan.
- Coverage type: credential-readiness.

Preconditions/setup:
1. Repository is present at `/Users/alex/Documents/GitHub/hermes-fly/.claude/worktrees/logical-leaping-plum`.

Command:

```bash
bash -euo pipefail -c '
  test -d /Users/alex/Documents/GitHub/hermes-fly/.claude/worktrees/logical-leaping-plum/.git
  cd /Users/alex/Documents/GitHub/hermes-fly/.claude/worktrees/logical-leaping-plum
  command -v npm >/dev/null
  command -v node >/dev/null
  command -v rg >/dev/null
  if rg -n "OPENROUTER_API_KEY=.*[A-Za-z0-9]|TELEGRAM_BOT_TOKEN=.*[A-Za-z0-9]" docs/plans/legacy-cleanup-20260316.md; then
    exit 1
  fi
' > tmp/verification/legacy-cleanup/VC0.out 2> tmp/verification/legacy-cleanup/VC0.err
```

Expected exit code: `0`  
Expected output: no secret-assignment matches in plan text.  
Artifacts to inspect:
- `tmp/verification/legacy-cleanup/VC0.out`
- `tmp/verification/legacy-cleanup/VC0.err`

Pass/fail rule:
- Pass only if command exits `0` and `VC0.err` is empty.

Cleanup/teardown:
- None.

---

### VC1 - Baseline gate before deletions

Purpose:
- Prove the TS baseline is green before removing legacy artifacts.
- Coverage type: happy path baseline.

Preconditions/setup:
1. VC0 passed.
2. Dependencies installed (`node_modules/` available).

Command:

```bash
bash -euo pipefail -c '
  cd /Users/alex/Documents/GitHub/hermes-fly/.claude/worktrees/logical-leaping-plum
  npm run build
  npm run arch:ddd-boundaries
  npm run test:domain-primitives
  npm run test:runtime-list
  npm run test:runtime-status
  npm run test:runtime-logs
  npm run test:runtime-cli-contracts
  npm run test:runtime-resolve-app-parity
  npm run test:runtime-doctor
  npm run test:runtime-destroy
  npm run test:runtime-resume
  npm run test:runtime-deploy
  npm run test:deploy-resolve-target-app
  npm run test:deploy-resume-deployment-checks
  npm run test:deploy-run-wizard
  npm run test:deploy-provision
  npm run test:diagnostics-run-doctor
  npm run test:release-destroy-deployment
' > tmp/verification/legacy-cleanup/VC1.out 2> tmp/verification/legacy-cleanup/VC1.err
```

Expected exit code: `0`  
Expected output: all commands succeed without test/build failures.  
Artifacts to inspect:
- `tmp/verification/legacy-cleanup/VC1.out`
- `tmp/verification/legacy-cleanup/VC1.err`

Pass/fail rule:
- Pass only if exit code is `0`.

Cleanup/teardown:
- None.

---

### VC2 - Slice 1 (legacy bridge removal) completion

Purpose:
- Prove all legacy bridge contract files are removed and dependency-cruiser updates are complete.
- Coverage type: failure/error path prevention.

Preconditions/setup:
1. Slice 1 implementation complete.

Command:

```bash
bash -euo pipefail -c '
  cd /Users/alex/Documents/GitHub/hermes-fly/.claude/worktrees/logical-leaping-plum
  test ! -d src/legacy/
  test ! -f src/contexts/runtime/application/ports/legacy-command-runner.port.ts
  ! rg -n "no-domain-to-legacy|only-bash-bridge-can-import-child-process|src/legacy/bash-bridge\\.ts" dependency-cruiser.cjs
  rg -n "only-process-adapter-can-import-child-process|Only the process adapter may use child_process directly" dependency-cruiser.cjs
  npm run build
  npm run arch:ddd-boundaries
' > tmp/verification/legacy-cleanup/VC2.out 2> tmp/verification/legacy-cleanup/VC2.err
```

Expected exit code: `0`  
Expected output:
- no legacy-rule strings remain.
- updated rule name/comment strings are present.

Artifacts to inspect:
- `dependency-cruiser.cjs`
- `tmp/verification/legacy-cleanup/VC2.out`
- `tmp/verification/legacy-cleanup/VC2.err`

Pass/fail rule:
- Pass only if all assertions and commands complete with exit `0`.

Cleanup/teardown:
- None.

---

### VC3 - Slice 2 and Slice 3 removals + kept test set integrity

Purpose:
- Prove all targeted script/test/parity removals occurred and only the intended BATS set remains.
- Coverage type: edge case + regression/safety.

Preconditions/setup:
1. Slice 2 and Slice 3 implementation complete.

Command:

```bash
bash -euo pipefail -c '
  cd /Users/alex/Documents/GitHub/hermes-fly/.claude/worktrees/logical-leaping-plum
  for f in \
    scripts/parity-capture.sh scripts/parity-compare.sh \
    scripts/verify-pr-a1-foundation.sh scripts/verify-pr-a2-ddd-boundaries.sh \
    scripts/verify-pr-b1-domain-primitives.sh scripts/verify-pr-c1-parity-harness.sh \
    scripts/verify-pr-d1-list-command.sh scripts/verify-pr-d1-report-content.sh \
    scripts/verify-pr-d2-status-logs.sh scripts/verify-pr-full-commander.sh \
    tests/verify-pr-d1-list-command.bats tests/verify-pr-d1-report-content.bats \
    tests/verify-pr-d2-status-logs.bats tests/verify-pr-full-commander.bats tests/parity-harness.bats \
    tests/config.bats tests/deploy.bats tests/destroy.bats tests/docker-helpers.bats tests/doctor.bats \
    tests/fly-helpers.bats tests/list.bats tests/logs.bats tests/messaging.bats tests/openrouter.bats \
    tests/prereqs.bats tests/prereqs_edge_cases.bats tests/reasoning.bats tests/status.bats tests/ui.bats \
    tests/list-ts-hybrid.bats tests/status-ts-hybrid.bats tests/logs-ts-hybrid.bats \
    tests/mocks/apt-get tests/mocks/brew tests/mocks/sudo tests/mocks/xcode-select; do
    test ! -e "$f"
  done
  test ! -d tests/parity/
  ! rg -n "\"parity:capture\"|\"parity:compare\"|\"parity:check\"|\"verify:pr-d1-list-command\"|\"verify:pr-d2-status-logs\"" package.json

  ls tests/*.bats | sed "s#tests/##" | sort > tmp/verification/legacy-cleanup/VC3.actual.kept-bats.txt
  cat > tmp/verification/legacy-cleanup/VC3.expected.kept-bats.txt <<EOF
deploy-ts.bats
destroy-ts.bats
doctor-ts.bats
hybrid-dispatch.bats
install.bats
integration.bats
release-guard.bats
resume-ts.bats
scaffold.bats
EOF
  comm -3 tmp/verification/legacy-cleanup/VC3.expected.kept-bats.txt tmp/verification/legacy-cleanup/VC3.actual.kept-bats.txt > tmp/verification/legacy-cleanup/VC3.kept-bats.diff
  test ! -s tmp/verification/legacy-cleanup/VC3.kept-bats.diff

  ls tests/mocks | sort > tmp/verification/legacy-cleanup/VC3.actual.mocks.txt
  cat > tmp/verification/legacy-cleanup/VC3.expected.mocks.txt <<EOF
curl
fly
git
mock-fail-gracefully
EOF
  comm -3 tmp/verification/legacy-cleanup/VC3.expected.mocks.txt tmp/verification/legacy-cleanup/VC3.actual.mocks.txt > tmp/verification/legacy-cleanup/VC3.mocks.diff
  test ! -s tmp/verification/legacy-cleanup/VC3.mocks.diff
' > tmp/verification/legacy-cleanup/VC3.out 2> tmp/verification/legacy-cleanup/VC3.err
```

Expected exit code: `0`  
Expected output:
- no deleted targets exist.
- kept BATS and kept mocks sets exactly match expected lists.

Artifacts to inspect:
- `tmp/verification/legacy-cleanup/VC3.out`
- `tmp/verification/legacy-cleanup/VC3.err`
- `tmp/verification/legacy-cleanup/VC3.actual.kept-bats.txt`
- `tmp/verification/legacy-cleanup/VC3.expected.kept-bats.txt`
- `tmp/verification/legacy-cleanup/VC3.kept-bats.diff`
- `tmp/verification/legacy-cleanup/VC3.actual.mocks.txt`
- `tmp/verification/legacy-cleanup/VC3.expected.mocks.txt`
- `tmp/verification/legacy-cleanup/VC3.mocks.diff`

Pass/fail rule:
- Pass only if exit code is `0` and both diff files are empty.

Cleanup/teardown:
- None.

---

### VC4 - Slice 4 final cleanup and documentation updates

Purpose:
- Prove archive modules are removed, references are gone, and required in-repo documentation updates were applied.
- Coverage type: failure/error path + regression/safety.

Preconditions/setup:
1. Slices 1-3 complete.
2. Slice 4 implementation complete.

Command:

```bash
bash -euo pipefail -c '
  cd /Users/alex/Documents/GitHub/hermes-fly/.claude/worktrees/logical-leaping-plum
  test ! -d lib/

  ! rg -n "lib/archive|lib/config\\.sh|lib/ui\\.sh|lib/deploy\\.sh" --glob "*.ts" --glob "*.sh" --glob "*.bats" --glob "*.json" . \
    --glob "!docs/**" --glob "!node_modules/**" --glob "!.git/**"

  ! rg -n "Legacy Context|bash-bridge|lib/archive|BATS parity" docs/psf/00-hermes-fly-architecture-overview.md
  ! rg -n "^## 5\\. Legacy Bridge|^## 7\\. Archived Bash Modules" docs/psf/06-cross-cutting-infrastructure.md
  ! rg -n "Legacy bridge not integrated|Archived bash modules|no-domain-to-legacy" docs/psf/08-maintainability.md
  rg -n "TypeScript source files.*54|BATS test files.*9" docs/psf/00-hermes-fly-architecture-overview.md

  npm run build
  npm run arch:ddd-boundaries
  npm run test:domain-primitives
  npm run test:runtime-list
  npm run test:runtime-status
  npm run test:runtime-logs
  npm run test:runtime-cli-contracts
  npm run test:runtime-resolve-app-parity
  npm run test:runtime-doctor
  npm run test:runtime-destroy
  npm run test:runtime-resume
  npm run test:runtime-deploy
  npm run test:deploy-resolve-target-app
  npm run test:deploy-resume-deployment-checks
  npm run test:deploy-run-wizard
  npm run test:deploy-provision
  npm run test:diagnostics-run-doctor
  npm run test:release-destroy-deployment
  ./tests/bats/bin/bats tests/deploy-ts.bats tests/destroy-ts.bats tests/doctor-ts.bats tests/resume-ts.bats tests/hybrid-dispatch.bats tests/release-guard.bats tests/scaffold.bats tests/install.bats tests/integration.bats
' > tmp/verification/legacy-cleanup/VC4.out 2> tmp/verification/legacy-cleanup/VC4.err
```

Expected exit code: `0`  
Expected output:
- no forbidden legacy references.
- required in-repo documentation updates present.
- build/tests pass.

Artifacts to inspect:
- `tmp/verification/legacy-cleanup/VC4.out`
- `tmp/verification/legacy-cleanup/VC4.err`
- `docs/psf/00-hermes-fly-architecture-overview.md`
- `docs/psf/06-cross-cutting-infrastructure.md`
- `docs/psf/08-maintainability.md`

Pass/fail rule:
- Pass only if exit code is `0` and no forbidden-reference checks match.

Cleanup/teardown:
- None.

---

## Step-to-Verification Traceability

1. Pre-Execution Gate -> VC1
2. Slice 1 -> VC2
3. Slice 2 -> VC3
4. Slice 3 -> VC3
5. Slice 4 -> VC4
6. Context + credential readiness -> VC0

---

## Rollback Plan

Each slice is independently reversible via `git revert`. The slices are ordered by dependency:
- Slice 1 (legacy bridge) has no dependents — safe to revert independently
- Slice 2 (scripts) has no dependents — safe to revert independently
- Slice 3 (BATS tests) should be reverted before Slice 4 if needed
- Slice 4 (archive removal) depends on Slice 3 (tests must be gone first)

Since all targets are already broken or unused, revert is unlikely to be needed.

## Files Removed Summary

| Category | Files | Lines Removed (est.) |
|----------|-------|---------------------|
| Legacy bridge TS | 3 | ~36 |
| Parity/verification scripts | 10 | ~3,000 |
| Dependent BATS tests (verify-pr-*, parity-harness) | 5 | ~670 |
| Parity baselines/snapshots | ~31 | ~200 |
| Legacy BATS tests (Category A) | 15 | ~8,500 |
| Hybrid BATS tests (Category B) | 3 | ~385 |
| Orphaned mocks | 4 | ~40 |
| Archived bash modules | 14 | ~3,563 |
| **Total** | **~85** | **~16,394** |

## Files Kept

| Category | Files | Reason |
|----------|-------|--------|
| TypeScript source (src/) | 54 (was 57) | Production code |
| TypeScript tests (tests-ts/) | 16 | Primary test suite |
| TS-focused BATS tests | 9 | Integration/CLI tests |
| Test infrastructure | ~8 | bats/, test_helper/, 4 mocks |
| Templates | 3 | Dockerfile, fly.toml, entrypoint.sh |
| Scripts (kept) | 3 | release-guard.sh, bootstrap.sh, install.sh |
| Config files | 4 | package.json, tsconfig.json, dependency-cruiser.cjs, hermes-fly |

---

## Execution Log

**Executed**: 2026-03-16
**Branch**: `chore/legacy-cleanup-20260316`
**Executor**: Claude Opus 4.6 (1M context)

### Pre-Execution Gate
- [x] VC0: Context/credential readiness passed
- [x] VC1: Full TS test suite baseline — all 16 test scripts pass

### Slice 1: Remove Legacy Bridge Contracts
- [x] S4 ANALYZE_CRITERIA: 8 criteria extracted (V1.1–V1.8)
- [x] S5 WRITE_TEST: Red confirmed — src/legacy/ dir, port file, dep-cruiser rules all exist
- [x] S6 CONFIRM_RED: Legacy artifacts present as expected
- [x] S7 IMPLEMENT: Deleted 3 TS files, removed src/legacy/, updated dependency-cruiser.cjs (removed no-domain-to-legacy rule, renamed only-bash-bridge → only-process-adapter)
- [x] S8 RUN_TESTS: pass (1 iteration)
- [x] S9 REFACTOR: no refactoring needed
- Commit: `0eb434e chore: remove unused legacy bash-bridge contracts and LegacyCommandRunnerPort`
- Anomalies: none

### Slice 2: Remove Parity/Verification Scripts and Dependent BATS Tests
- [x] S4 ANALYZE_CRITERIA: 23 criteria extracted (V2.1–V2.23)
- [x] S5 WRITE_TEST: Red confirmed — scripts, parity dir, npm script entries all exist
- [x] S6 CONFIRM_RED: confirmed
- [x] S7 IMPLEMENT: Deleted 10 scripts, 5 dependent BATS, parity dir, 5 npm script entries. Also fixed pre-existing broken tests in scaffold.bats (removed 9 tests referencing lib/*.sh module guards and function existence checks), hybrid-dispatch.bats (rewrote — old file tested legacy dispatch modes no longer present in simplified shim), deploy-ts.bats (added OPENROUTER_API_KEY to test env)
- [x] S8 RUN_TESTS: pass (3 iterations — first failed on plan's V2.22 overly broad `grep -c parity` matching kept test:runtime-resolve-app-parity; second failed on pre-existing broken BATS tests; third passed after fixes)
- [x] S9 REFACTOR: no refactoring needed
- Commit: `77a9725 chore: remove legacy parity scripts and PR-specific verification artifacts`
- Anomalies:
  - **S8 (V2.22)**: Plan's `grep -c 'parity' package.json` expected 0, but `test:runtime-resolve-app-parity` (a kept TS test) contains "parity". Resolved by checking for the 5 specific removed entries instead. Intent satisfied.
  - **S8 (V2.21)**: scaffold.bats had 9 already-broken tests referencing `lib/*.sh` (moved to archive in prior PR). Plan classified scaffold.bats as Category D (KEEP) but didn't account for these. Removed broken tests, kept 39 valid template/entrypoint tests.
  - **S8 (V2.21)**: hybrid-dispatch.bats was almost entirely testing legacy dispatch modes (HERMES_FLY_IMPL_MODE, TS_COMMANDS, fallback) that were removed in PR #12. Plan classified as Category D (KEEP, "Validates TS is primary runtime") but most tests were pre-existing failures. Rewrote to 6 tests validating the TS-only runtime (version, help, version flags).
  - **S8 (V2.21)**: deploy-ts.bats test 4 was a pre-existing environment-dependent failure — deploy prereq check fails on missing OPENROUTER_API_KEY before reaching the fly-missing check. Fixed by injecting dummy key.

### Slice 3: Retire Legacy BATS Tests
- [x] S4 ANALYZE_CRITERIA: 23 criteria extracted (V3.1–V3.23)
- [x] S5 WRITE_TEST: Red confirmed — 15 legacy + 3 hybrid BATS + 4 orphaned mocks all exist
- [x] S6 CONFIRM_RED: confirmed
- [x] S7 IMPLEMENT: Deleted 15 legacy BATS, 3 hybrid BATS, 4 orphaned mocks
- [x] S8 RUN_TESTS: pass (1 iteration)
- [x] S9 REFACTOR: no refactoring needed
- Commit: `76b4e5a chore: retire broken legacy BATS tests — TS test suite provides equivalent coverage`
- Anomalies: none

### Slice 4: Remove Archived Bash Modules and Clean Up
- [x] S4 ANALYZE_CRITERIA: 24 criteria extracted (V4.1–V4.24)
- [x] S5 WRITE_TEST: Red confirmed — lib/ directory exists
- [x] S6 CONFIRM_RED: confirmed
- [x] S7 IMPLEMENT: Deleted lib/ (14 archived bash modules), updated resolve-app-parity.test.ts comment, added TypeScript/BATS metrics to PSF 00-overview
- [x] S8 RUN_TESTS: pass (1 iteration)
- [x] S9 REFACTOR: no refactoring needed
- Commit: `4b1b905 chore: remove archived bash modules and clean up test infrastructure`
- Anomalies:
  - **S7 (Step 4.1)**: `resolve-app-parity.test.ts` had comment `// Parity tests matching Bash lib/config.sh:235-264 behavior` which would fail the zero-reference check. Updated to remove `lib/config.sh` reference.
  - **S7 (Step 4.3)**: Plan referenced `docs/psf/06-cross-cutting-infrastructure.md` which doesn't exist (actual: `06-debugging.md`). Plan's `! rg` negative check passes regardless (file not found → non-zero → negated to zero). No sections to delete.
  - **S7 (Step 4.3)**: Plan's metrics table update (57→54 TS files, set BATS to 9) referenced a table that didn't exist in the Bash-era PSF overview. Added metrics rows to satisfy VC4 positive check.

### VERIFY_ALL
- VC0: pass
- VC1: pass (baseline before changes)
- VC2: pass — legacy bridge fully removed, dep-cruiser updated
- VC3: pass — all deleted files confirmed absent, kept BATS set exactly matches expected 9 files, kept mocks match expected 4 files
- VC4: pass — lib/ gone, zero forbidden references, PSF docs clean, all 16 TS test scripts pass, all 98 kept BATS tests pass, CLI smoke tests pass
- Criteria walk: all satisfied
