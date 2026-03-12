#!/usr/bin/env bats

cleanup_parity_temp_dirs() {
  local d
  for d in tests/parity/_tmp_run1 tests/parity/_tmp_run2 tests/parity/_tmp_mutation; do
    if [[ -d "$d" ]]; then
      rm -r "$d"
    fi
  done
}

backup_manifest() {
  SCENARIO_BACKUP="$(mktemp)"
  cp "$SCENARIO_FILE" "$SCENARIO_BACKUP"
}

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/.." && pwd)"
  cd "$REPO_ROOT"

  SCENARIO_FILE="tests/parity/scenarios/non_destructive_commands.list"
  SCENARIO_BACKUP=""
  cleanup_parity_temp_dirs
}

teardown() {
  if [[ -n "$SCENARIO_BACKUP" && -f "$SCENARIO_BACKUP" ]]; then
    mv "$SCENARIO_BACKUP" "$SCENARIO_FILE"
  fi

  cleanup_parity_temp_dirs
}

@test "capture determinism under forced TS env" {
  run env HERMES_FLY_IMPL_MODE=hybrid HERMES_FLY_TS_COMMANDS=list,status,logs \
    bash scripts/parity-capture.sh --out-dir tests/parity/_tmp_run1
  [ "$status" -eq 0 ]
  [[ "$output" == *"Parity capture completed: tests/parity/_tmp_run1"* ]]

  run bash scripts/parity-compare.sh --baseline tests/parity/baseline --candidate tests/parity/_tmp_run1
  [ "$status" -eq 0 ]
  [[ "$output" == *"Parity compare passed."* ]]
}

@test "capture rejects malformed scenario manifest line" {
  backup_manifest
  printf '%s\n' 'version|version' 'BROKEN_LINE_WITHOUT_PIPE' > "$SCENARIO_FILE"

  run bash scripts/parity-capture.sh --out-dir tests/parity/_tmp_run1
  [ "$status" -ne 0 ]
  [[ "$output" == *"Invalid scenario line 2: BROKEN_LINE_WITHOUT_PIPE"* ]]
}

@test "compare rejects malformed scenario manifest line" {
  backup_manifest
  printf '%s\n' 'version|version' 'BROKEN_LINE_WITHOUT_PIPE' > "$SCENARIO_FILE"

  run bash scripts/parity-compare.sh --baseline tests/parity/baseline --candidate tests/parity/baseline
  [ "$status" -ne 0 ]
  [[ "$output" == *"Invalid scenario line 2: BROKEN_LINE_WITHOUT_PIPE"* ]]
}

@test "compare fails on unexpected extra snapshot file" {
  cp -R tests/parity/baseline tests/parity/_tmp_run2
  echo '# extra' > tests/parity/_tmp_run2/unexpected.extra.snap

  run bash scripts/parity-compare.sh --baseline tests/parity/baseline --candidate tests/parity/_tmp_run2
  [ "$status" -ne 0 ]
  [[ "$output" == *"Unexpected snapshot: unexpected.extra.snap (candidate)"* ]]
}

@test "verifier script leaves no parity temp dirs" {
  run env HERMES_FLY_PARITY_VERIFY_SKIP_BATS=1 ./scripts/verify-pr-c1-parity-harness.sh
  [ "$status" -eq 0 ]
  [[ "$output" == *"PR-C1 verification passed."* ]]

  [ ! -d tests/parity/_tmp_run1 ]
  [ ! -d tests/parity/_tmp_run2 ]
  [ ! -d tests/parity/_tmp_mutation ]
}
