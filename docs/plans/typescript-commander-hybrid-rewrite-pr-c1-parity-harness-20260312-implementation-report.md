# PR-C1 Review Remediation Implementation Report

Date: 2026-03-12
Plan: `docs/plans/typescript-commander-hybrid-rewrite-pr-c1-parity-harness-20260312_REVIEW_1.md`

## Summary

Implemented the PR-C1 review remediation scope: deterministic env isolation in parity capture, strict scenario manifest validation, unexpected snapshot detection, deterministic diff labels, verifier temp-dir cleanup hygiene, `_tmp_mutation` ignore rule, and parity harness regression tests.

## Files Changed

- `.gitignore`
- `scripts/parity-capture.sh`
- `scripts/parity-compare.sh`
- `scripts/verify-pr-c1-parity-harness.sh`
- `tests/parity-harness.bats`
- `docs/plans/typescript-commander-hybrid-rewrite-pr-c1-parity-harness-20260312-implementation-report.md`

## Verification Runs

1. `npm run parity:check`  
Exit: `0`  
Key output:
- `Parity capture completed: tests/parity/current`
- `Parity compare passed.`

2. `HERMES_FLY_IMPL_MODE=hybrid HERMES_FLY_TS_COMMANDS=list,status,logs bash scripts/parity-capture.sh --out-dir tests/parity/_tmp_run1` then `bash scripts/parity-compare.sh --baseline tests/parity/baseline --candidate tests/parity/_tmp_run1`  
Exit: `0`  
Key output:
- `Parity capture completed: tests/parity/_tmp_run1`
- `Parity compare passed.`

3. Capture manifest negative path  
Command:
- `printf '%s\n' 'version|version' 'BROKEN_LINE_WITHOUT_PIPE' > tests/parity/scenarios/non_destructive_commands.list`
- `bash scripts/parity-capture.sh --out-dir tests/parity/_tmp_run1`  
Exit: non-zero  
Key output:
- `Invalid scenario line 2: BROKEN_LINE_WITHOUT_PIPE`

4. Compare manifest negative path  
Command:
- `printf '%s\n' 'version|version' 'BROKEN_LINE_WITHOUT_PIPE' > tests/parity/scenarios/non_destructive_commands.list`
- `bash scripts/parity-compare.sh --baseline tests/parity/baseline --candidate tests/parity/baseline`  
Exit: non-zero  
Key output:
- `Invalid scenario line 2: BROKEN_LINE_WITHOUT_PIPE`

5. Compare unexpected snapshot negative path  
Command:
- `cp -R tests/parity/baseline tests/parity/_tmp_run2`
- `echo '# extra' > tests/parity/_tmp_run2/unexpected.extra.snap`
- `bash scripts/parity-compare.sh --baseline tests/parity/baseline --candidate tests/parity/_tmp_run2`  
Exit: non-zero  
Key output:
- `Unexpected snapshot: unexpected.extra.snap (candidate)`

6. Compare mismatch output determinism  
Command:
- `cp -R tests/parity/baseline tests/parity/_tmp_mutation`
- `echo '# mutation' >> tests/parity/_tmp_mutation/version.stdout.snap`
- `bash scripts/parity-compare.sh --baseline tests/parity/baseline --candidate tests/parity/_tmp_mutation`  
Exit: non-zero  
Key output:
- `Mismatch: version.stdout.snap`
- `--- baseline/version.stdout.snap`
- `+++ candidate/version.stdout.snap`

7. Verifier hygiene  
Command:
- `./scripts/verify-pr-c1-parity-harness.sh`
- `test ! -d tests/parity/_tmp_run1`
- `test ! -d tests/parity/_tmp_run2`
- `test ! -d tests/parity/_tmp_mutation`  
Exit: `0`  
Key output:
- `PR-C1 verification passed.`

8. Regression suite  
Command:
- `npm run typecheck`
- `npm run arch:ddd-boundaries`
- `npm run test:domain-primitives`
- `tests/bats/bin/bats tests/parity-harness.bats tests/hybrid-dispatch.bats tests/integration.bats`  
Exit: `0`  
Key output:
- `✔ no dependency violations found`
- `# pass 7` (domain primitives)
- `1..29` with all Bats tests `ok`

## Criteria Matrix

- 5.1 File-level checks: satisfied via `test -f ...` for all listed files.
- 5.2 Baseline parity success path: satisfied via `npm run parity:check` (`Parity capture completed`, `Parity compare passed`).
- 5.3 Env-isolated determinism under forced TS vars: satisfied via forced-env capture + compare pass.
- 5.4 Manifest validation negative path (capture): satisfied with non-zero exit and `Invalid scenario line 2: BROKEN_LINE_WITHOUT_PIPE`.
- 5.5 Manifest validation negative path (compare): satisfied with non-zero exit and `Invalid scenario line 2: BROKEN_LINE_WITHOUT_PIPE`.
- 5.6 Compare unexpected snapshot negative path: satisfied with non-zero exit and `Unexpected snapshot: unexpected.extra.snap (candidate)`.
- 5.7 Compare mismatch output format determinism: satisfied with non-zero exit, mismatch line, and deterministic labeled diff headers.
- 5.8 Verifier temp-dir hygiene: satisfied with verifier success and all three temp directories absent afterward.
- 5.9 Static/boundary and runtime regression checks: satisfied (`typecheck`, boundary check, domain tests, parity/hybrid/integration bats all pass).

## Anomalies / Deviations

1. To prevent recursion when `tests/parity-harness.bats` executes the verifier script, `scripts/verify-pr-c1-parity-harness.sh` accepts `HERMES_FLY_PARITY_VERIFY_SKIP_BATS=1` for nested test-only invocation. Default behavior remains unchanged.

## Final Status

Complete. All section 5 verification criteria passed and remediation scope was implemented.
