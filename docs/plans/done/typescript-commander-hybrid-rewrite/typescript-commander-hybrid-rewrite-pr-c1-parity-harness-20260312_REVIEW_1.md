# PR-C1 Review Remediation Plan: Determinism Hardening + Verifier Hygiene

Date: 2026-03-12  
Parent plan: `docs/plans/typescript-commander-hybrid-rewrite-pr-c1-parity-harness-20260312.md`  
Parent phase: Phase 1 (Command Contract Snapshot), review remediation chunk  
Timebox: 60 minutes (single session)  
Assignee profile: Junior developer  
Target branch: `feat/ts-pr-c1-parity-harness` (recommended)

## Implementation Status

Status: Ready for implementation  
Evidence report (must be created in this PR): `docs/plans/typescript-commander-hybrid-rewrite-pr-c1-parity-harness-20260312-implementation-report.md`

---

## 1) Issue Summary (Jira/Linear style)

Address all PR-C1 review findings by hardening parity determinism, eliminating verifier workspace pollution, adding manifest/compare edge-case handling, and creating the missing implementation evidence report.

This PR remains harness-only: no command migration and no user-facing CLI behavior change.

---

## 2) Scope

### In scope (must ship in this PR)

1. Make parity capture deterministic even when caller environment sets TS dispatch variables.
2. Add strict scenario manifest validation to capture and compare flows.
3. Detect unexpected stale snapshot files during compare.
4. Make mismatch diff output deterministic (label-based, no timestamp-dependent headers).
5. Ensure verifier script does not leave untracked temp artifacts.
6. Add `_tmp_mutation` transient ignore rule for defense-in-depth.
7. Create the missing implementation evidence report document.
8. Add focused harness regression tests for new negative-path and determinism checks.

### Out of scope (do not do in this PR)

1. No `hermes-fly` dispatch logic changes.
2. No TypeScript command handlers (`list`, `status`, etc.).
3. No `scripts/install.sh` changes.
4. No `scripts/release-guard.sh` changes.
5. No CI workflow file additions.
6. No destructive/interactive parity scenarios (`deploy`, `destroy`, `resume`, `doctor`) in this chunk.

---

## 3) Preconditions (must be true before coding)

Run from repo root:

```bash
cd /Users/alex/Documents/GitHub/hermes-fly
```

Confirm PR-C1 anchors before edits:

1. Capture script exists and currently sets deterministic base env:
- `scripts/parity-capture.sh`
2. Compare script exists and currently performs missing/mismatch checks:
- `scripts/parity-compare.sh`
3. Verifier script exists and currently runs parity + regression gates:
- `scripts/verify-pr-c1-parity-harness.sh`
4. Scenario manifest and baseline snapshots exist:
- `tests/parity/scenarios/non_destructive_commands.list`
- `tests/parity/baseline/*.snap`
5. Existing quality gates pass:

```bash
npm run parity:check
npm run typecheck
npm run arch:ddd-boundaries
npm run test:domain-primitives
tests/bats/bin/bats tests/hybrid-dispatch.bats tests/integration.bats
```

If these are not true, resolve drift first.

---

## 4) Exact File Changes

## 4.1 Update `scripts/parity-capture.sh` for env isolation + manifest validation

Path: `scripts/parity-capture.sh`  
Action: modify.

Required changes:

1. Force deterministic legacy dispatch regardless of caller shell env:
- `export HERMES_FLY_IMPL_MODE=legacy`
- `unset HERMES_FLY_TS_COMMANDS`

2. Validate scenario manifest lines before execution:
- reject lines without exactly one `|`,
- reject empty scenario key,
- reject empty args payload,
- on invalid line, print:
  - `Invalid scenario line <line-number>: <line-content>`
- exit non-zero on first invalid line.

3. Keep existing required behavior unchanged:
- `NO_COLOR=1`, `LC_ALL=C`, `TZ=UTC`, mock `PATH`, temp config/log dirs,
- `config_save_app "test-app" "ord"`,
- write `stdout/stderr/exit` snapshots,
- print `Parity capture completed: <out-dir>`.

## 4.2 Update `scripts/parity-compare.sh` for strict set equality + deterministic diff labels

Path: `scripts/parity-compare.sh`  
Action: modify.

Required changes:

1. Validate scenario manifest lines with the same rules as capture script (same error format).
2. Continue verifying required snapshots exist and compare byte-for-byte.
3. Detect extra unexpected snapshot files in both baseline and candidate directories:
- if an unexpected `*.snap` file is present, print:
  - `Unexpected snapshot: <filename> (<baseline|candidate>)`
- mark compare as failed.
4. On mismatch, print deterministic labeled unified diff:
- keep `Mismatch: <scenario>.<stream>.snap`
- print diff with stable labels (no timestamp-bearing path headers), e.g.:
  - `--- baseline/<scenario>.<stream>.snap`
  - `+++ candidate/<scenario>.<stream>.snap`
5. Exit `1` on any missing/mismatch/unexpected/invalid-manifest case.
6. Print `Parity compare passed.` only when all checks pass.

## 4.3 Update `scripts/verify-pr-c1-parity-harness.sh` for temp hygiene

Path: `scripts/verify-pr-c1-parity-harness.sh`  
Action: modify.

Required changes:

1. Ensure temp parity dirs are cleaned on both success and failure:
- `tests/parity/_tmp_run1`
- `tests/parity/_tmp_run2`
- `tests/parity/_tmp_mutation`
- use `trap` cleanup strategy.

2. Keep existing verification flow unchanged.

3. Tighten negative compare assertion:
- require output contains exactly:
  - `Mismatch: version.stdout.snap`

4. Print `PR-C1 verification passed.` only after cleanup-safe success path.

## 4.4 Update `.gitignore` for verifier mutation temp dir

Path: `.gitignore`  
Action: modify.

Required changes:

1. Add ignore entry:
- `tests/parity/_tmp_mutation/`

2. Keep existing parity ignore entries unchanged:
- `tests/parity/current/`
- `tests/parity/_tmp_run1/`
- `tests/parity/_tmp_run2/`

3. Do not ignore:
- `tests/parity/baseline/`

## 4.5 Add implementation evidence report file

Create:

1. `docs/plans/typescript-commander-hybrid-rewrite-pr-c1-parity-harness-20260312-implementation-report.md`

Required content sections:

1. `Summary`
2. `Files Changed`
3. `Verification Runs` (command + exit status + key output)
4. `Criteria Matrix` (map plan criteria to evidence)
5. `Anomalies / Deviations`
6. `Final Status`

## 4.6 Add focused harness regression tests

Create:

1. `tests/parity-harness.bats`

Required tests:

1. Capture determinism under forced TS env:
- run capture with `HERMES_FLY_IMPL_MODE=hybrid` and `HERMES_FLY_TS_COMMANDS=list,status,logs`,
- compare against baseline must pass.

2. Capture rejects malformed scenario manifest line.
3. Compare rejects malformed scenario manifest line.
4. Compare fails on unexpected extra snapshot file.
5. Verifier script leaves no `_tmp_run1`, `_tmp_run2`, `_tmp_mutation` directories after completion.

Test integration requirement:

1. Existing bats invocations in this PR must include `tests/parity-harness.bats`.

---

## 5) Deterministic Verification Criteria

All checks are required.

## 5.1 File-level checks

Run:

```bash
test -f scripts/parity-capture.sh
test -f scripts/parity-compare.sh
test -f scripts/verify-pr-c1-parity-harness.sh
test -f tests/parity/scenarios/non_destructive_commands.list
test -f tests/parity-harness.bats
test -f docs/plans/typescript-commander-hybrid-rewrite-pr-c1-parity-harness-20260312-implementation-report.md
```

Expected: all exit `0`.

## 5.2 Baseline parity success path

Run:

```bash
npm run parity:check
```

Expected:

1. Exit `0`.
2. Capture step prints `Parity capture completed:`.
3. Compare step prints `Parity compare passed.`.

## 5.3 Env-isolated determinism under forced TS shell vars

Run:

```bash
HERMES_FLY_IMPL_MODE=hybrid HERMES_FLY_TS_COMMANDS=list,status,logs \
  bash scripts/parity-capture.sh --out-dir tests/parity/_tmp_run1
bash scripts/parity-compare.sh --baseline tests/parity/baseline --candidate tests/parity/_tmp_run1
```

Expected:

1. Compare exits `0`.
2. No mismatch output.

## 5.4 Manifest validation negative path (capture)

Run:

```bash
cp tests/parity/scenarios/non_destructive_commands.list tests/parity/scenarios/non_destructive_commands.list.bak
printf '%s\n' 'version|version' 'BROKEN_LINE_WITHOUT_PIPE' > tests/parity/scenarios/non_destructive_commands.list
bash scripts/parity-capture.sh --out-dir tests/parity/_tmp_run1
mv tests/parity/scenarios/non_destructive_commands.list.bak tests/parity/scenarios/non_destructive_commands.list
```

Expected:

1. capture exits non-zero,
2. output contains `Invalid scenario line 2: BROKEN_LINE_WITHOUT_PIPE`.

## 5.5 Manifest validation negative path (compare)

Run:

```bash
cp tests/parity/scenarios/non_destructive_commands.list tests/parity/scenarios/non_destructive_commands.list.bak
printf '%s\n' 'version|version' 'BROKEN_LINE_WITHOUT_PIPE' > tests/parity/scenarios/non_destructive_commands.list
bash scripts/parity-compare.sh --baseline tests/parity/baseline --candidate tests/parity/baseline
mv tests/parity/scenarios/non_destructive_commands.list.bak tests/parity/scenarios/non_destructive_commands.list
```

Expected:

1. compare exits non-zero,
2. output contains `Invalid scenario line 2: BROKEN_LINE_WITHOUT_PIPE`.

## 5.6 Compare unexpected snapshot negative path

Run:

```bash
cp -R tests/parity/baseline tests/parity/_tmp_run2
echo '# extra' > tests/parity/_tmp_run2/unexpected.extra.snap
bash scripts/parity-compare.sh --baseline tests/parity/baseline --candidate tests/parity/_tmp_run2
```

Expected:

1. compare exits non-zero,
2. output contains `Unexpected snapshot: unexpected.extra.snap (candidate)`.

## 5.7 Compare mismatch output format determinism

Run:

```bash
cp -R tests/parity/baseline tests/parity/_tmp_mutation
echo '# mutation' >> tests/parity/_tmp_mutation/version.stdout.snap
bash scripts/parity-compare.sh --baseline tests/parity/baseline --candidate tests/parity/_tmp_mutation
```

Expected:

1. compare exits non-zero,
2. output contains `Mismatch: version.stdout.snap`,
3. diff header lines contain:
- `--- baseline/version.stdout.snap`
- `+++ candidate/version.stdout.snap`

## 5.8 Verifier temp-dir hygiene

Run:

```bash
./scripts/verify-pr-c1-parity-harness.sh
test ! -d tests/parity/_tmp_run1
test ! -d tests/parity/_tmp_run2
test ! -d tests/parity/_tmp_mutation
```

Expected:

1. verifier exits `0`,
2. prints `PR-C1 verification passed.`,
3. all three temp directory checks exit `0`.

## 5.9 Static/boundary and runtime regression checks

Run:

```bash
npm run typecheck
npm run arch:ddd-boundaries
npm run test:domain-primitives
tests/bats/bin/bats tests/parity-harness.bats tests/hybrid-dispatch.bats tests/integration.bats
```

Expected: all exit `0`.

---

## 6) Definition of Done (PR acceptance)

PR is done only when all are true:

1. `scripts/parity-capture.sh` is deterministic under forced TS env variables.
2. Capture and compare reject malformed scenario manifest lines with deterministic error messages.
3. `scripts/parity-compare.sh` fails on missing, mismatched, and unexpected snapshot files.
4. Mismatch diffs use deterministic labeled headers.
5. `scripts/verify-pr-c1-parity-harness.sh` leaves no temp parity dirs behind.
6. Implementation evidence report file exists and documents executed checks.
7. `npm run parity:check` passes.
8. Existing quality gates remain green (`typecheck`, `arch:ddd-boundaries`, domain tests, parity bats, hybrid/integration bats).
9. Existing CLI behavior remains unchanged.
10. No changes in:
- `hermes-fly`
- `scripts/install.sh`
- `scripts/release-guard.sh`

---

## 7) Commit and PR Metadata

Recommended commit message:

```text
PR-C1 review remediation: harden parity determinism and verifier hygiene
```

Recommended PR title:

```text
PR-C1 Review: deterministic parity hardening and edge-case coverage
```

Recommended PR checklist text:

1. Ran `npm run parity:check`
2. Verified forced-TS-env capture still matches baseline
3. Verified malformed scenario manifest fails in capture and compare
4. Verified unexpected extra snapshot fails compare
5. Verified mismatch diff headers use deterministic labels
6. Ran `./scripts/verify-pr-c1-parity-harness.sh` and confirmed temp dirs are removed
7. Created implementation evidence report file
8. Ran `npm run typecheck`
9. Ran `npm run arch:ddd-boundaries`
10. Ran `npm run test:domain-primitives`
11. Ran `tests/bats/bin/bats tests/parity-harness.bats tests/hybrid-dispatch.bats tests/integration.bats`

---

## 8) Rollback

If regressions are found:

1. Revert this remediation commit.
2. Re-run:

```bash
npm run parity:check
npm run typecheck
npm run arch:ddd-boundaries
npm run test:domain-primitives
tests/bats/bin/bats tests/parity-harness.bats tests/hybrid-dispatch.bats tests/integration.bats
```

Expected: behavior returns to PR-C1 baseline.

---

## References

- [GNU diffutils manual](https://www.gnu.org/software/diffutils/manual/)
- [Bash Reference Manual](https://www.gnu.org/software/bash/manual/bash.html)
- [Bats-core documentation](https://bats-core.readthedocs.io/)

## Execution Log

### Slice 1: parity-capture-env-isolation-and-manifest-validation
- [x] S4 ANALYZE_CRITERIA: 7 criteria extracted
- [x] S5 WRITE_TEST: inline shell assertions for `scripts/parity-capture.sh`
- [x] S6 CONFIRM_RED: test fails as expected
- [x] S7 IMPLEMENT: `scripts/parity-capture.sh` modified
- [x] S8 RUN_TESTS: pass (1 iterations)
- [x] S9 REFACTOR: no refactoring needed
- Anomalies: none

### Slice 2: parity-compare-validation-set-equality-deterministic-diff
- [x] S4 ANALYZE_CRITERIA: 6 criteria extracted
- [x] S5 WRITE_TEST: inline shell assertions for `scripts/parity-compare.sh`
- [x] S6 CONFIRM_RED: test fails as expected
- [x] S7 IMPLEMENT: `scripts/parity-compare.sh` modified
- [x] S8 RUN_TESTS: pass (2 iterations)
- [x] S9 REFACTOR: no refactoring needed
- Anomalies: S5 static-string diff-header assertion was replaced by behavior assertion in S8a

### Slice 3: verifier-temp-hygiene-and-exact-mismatch-assertion
- [x] S4 ANALYZE_CRITERIA: 4 criteria extracted
- [x] S5 WRITE_TEST: inline shell assertions for `scripts/verify-pr-c1-parity-harness.sh`
- [x] S6 CONFIRM_RED: test fails as expected
- [x] S7 IMPLEMENT: `scripts/verify-pr-c1-parity-harness.sh` modified
- [x] S8 RUN_TESTS: pass (2 iterations)
- [x] S9 REFACTOR: no refactoring needed
- Anomalies: S8a fixed `cleanup` to return zero under `set -e` when temp directories are absent

### Slice 4: gitignore-tmp-mutation
- [x] S4 ANALYZE_CRITERIA: 3 criteria extracted
- [x] S5 WRITE_TEST: inline shell assertions against `.gitignore`
- [x] S6 CONFIRM_RED: test fails as expected
- [x] S7 IMPLEMENT: `.gitignore` modified
- [x] S8 RUN_TESTS: pass (1 iterations)
- [x] S9 REFACTOR: no refactoring needed
- Anomalies: none

### Slice 5: implementation-evidence-report
- [x] S4 ANALYZE_CRITERIA: 6 criteria extracted
- [x] S5 WRITE_TEST: section-header assertions for implementation report file
- [x] S6 CONFIRM_RED: test fails as expected
- [x] S7 IMPLEMENT: `docs/plans/typescript-commander-hybrid-rewrite-pr-c1-parity-harness-20260312-implementation-report.md` created and finalized
- [x] S8 RUN_TESTS: pass (1 iterations)
- [x] S9 REFACTOR: no refactoring needed
- Anomalies: none

### Slice 6: parity-harness-bats-suite-and-integration
- [x] S4 ANALYZE_CRITERIA: 7 criteria extracted
- [x] S5 WRITE_TEST: file/integration assertions + `tests/bats/bin/bats tests/parity-harness.bats`
- [x] S6 CONFIRM_RED: test fails as expected
- [x] S7 IMPLEMENT: `tests/parity-harness.bats` created; `scripts/verify-pr-c1-parity-harness.sh` updated to include parity bats
- [x] S8 RUN_TESTS: pass (1 iterations)
- [x] S9 REFACTOR: no refactoring needed
- Anomalies: added `HERMES_FLY_PARITY_VERIFY_SKIP_BATS=1` nested-test guard to prevent verifier recursion when parity bats executes verifier

### VERIFY_ALL
- Test suite: pass (1 iteration)
- Criteria walk: all satisfied
