#!/usr/bin/env bats
# tests/hybrid-dispatch.bats — hybrid dispatcher contract checks

setup() {
  load 'test_helper/common-setup'
  _common_setup

  EXPECTED_VERSION="$(
    sed -n 's/^HERMES_FLY_VERSION="\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\)"$/\1/p' \
      "${PROJECT_ROOT}/hermes-fly" | head -1
  )"
}

teardown() {
  _common_teardown
}

@test "default impl mode is legacy" {
  run bash -c '"${PROJECT_ROOT}/hermes-fly" version 2>&1'
  assert_success
  assert_output "hermes-fly ${EXPECTED_VERSION}"
}

@test "legacy mode ignores TS allowlist" {
  run bash -c 'HERMES_FLY_IMPL_MODE=legacy HERMES_FLY_TS_COMMANDS=version "${PROJECT_ROOT}/hermes-fly" version 2>&1'
  assert_success
  assert_output "hermes-fly ${EXPECTED_VERSION}"
}

@test "hybrid mode with non-allowlisted command stays legacy" {
  run bash -c 'HERMES_FLY_IMPL_MODE=hybrid HERMES_FLY_TS_COMMANDS=list "${PROJECT_ROOT}/hermes-fly" version 2>&1'
  assert_success
  assert_output "hermes-fly ${EXPECTED_VERSION}"
}

@test "hybrid mode allowlisted command falls back when dist cli artifact is missing" {
  run bash -c 'rm -f "${PROJECT_ROOT}/dist/cli.js"; HERMES_FLY_IMPL_MODE=hybrid HERMES_FLY_TS_COMMANDS=version "${PROJECT_ROOT}/hermes-fly" version 2>&1'
  assert_success
  assert_equal "${#lines[@]}" "2"
  assert_line --index 0 "Warning: TS implementation unavailable for command 'version'; falling back to legacy"
  assert_line --index 1 "hermes-fly ${EXPECTED_VERSION}"
}

@test "ts mode allowlisted command falls back when dist cli artifact is missing" {
  run bash -c 'rm -f "${PROJECT_ROOT}/dist/cli.js"; HERMES_FLY_IMPL_MODE=ts HERMES_FLY_TS_COMMANDS=version "${PROJECT_ROOT}/hermes-fly" version 2>&1'
  assert_success
  assert_equal "${#lines[@]}" "2"
  assert_line --index 0 "Warning: TS implementation unavailable for command 'version'; falling back to legacy"
  assert_line --index 1 "hermes-fly ${EXPECTED_VERSION}"
}

@test "invalid impl mode normalizes to legacy with warning" {
  run bash -c 'HERMES_FLY_IMPL_MODE=invalid "${PROJECT_ROOT}/hermes-fly" version 2>&1'
  assert_success
  assert_equal "${#lines[@]}" "2"
  assert_line --index 0 "Warning: Unknown HERMES_FLY_IMPL_MODE 'invalid', using legacy"
  assert_line --index 1 "hermes-fly ${EXPECTED_VERSION}"
}
