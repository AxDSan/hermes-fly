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

@test "default help output is byte-identical to explicit legacy mode" {
  run bash -c '
    default_out="$(mktemp)"
    legacy_out="$(mktemp)"
    trap "rm -f \"${default_out}\" \"${legacy_out}\"" EXIT
    "${PROJECT_ROOT}/hermes-fly" help >"${default_out}"
    HERMES_FLY_IMPL_MODE=legacy "${PROJECT_ROOT}/hermes-fly" help >"${legacy_out}"
    cmp -s "${default_out}" "${legacy_out}"
  '
  assert_success
}

@test "default deploy help output is byte-identical to explicit legacy mode" {
  run bash -c '
    default_out="$(mktemp)"
    legacy_out="$(mktemp)"
    trap "rm -f \"${default_out}\" \"${legacy_out}\"" EXIT
    "${PROJECT_ROOT}/hermes-fly" deploy --help >"${default_out}"
    HERMES_FLY_IMPL_MODE=legacy "${PROJECT_ROOT}/hermes-fly" deploy --help >"${legacy_out}"
    cmp -s "${default_out}" "${legacy_out}"
  '
  assert_success
}

@test "hybrid fallback emits one stderr warning line and preserves stdout contract" {
  run bash -c '
    out_file="$(mktemp)"
    err_file="$(mktemp)"
    trap "rm -f \"${out_file}\" \"${err_file}\"" EXIT
    rm -f "${PROJECT_ROOT}/dist/cli.js"
    HERMES_FLY_IMPL_MODE=hybrid HERMES_FLY_TS_COMMANDS=version \
      "${PROJECT_ROOT}/hermes-fly" version >"${out_file}" 2>"${err_file}"
    printf "STDOUT=%s\n" "$(cat "${out_file}")"
    printf "STDERR_LINES=%s\n" "$(wc -l < "${err_file}" | tr -d "[:space:]")"
    printf "STDERR_FIRST=%s\n" "$(head -n 1 "${err_file}")"
  '
  assert_success
  assert_line --index 0 "STDOUT=hermes-fly ${EXPECTED_VERSION}"
  assert_line --index 1 "STDERR_LINES=1"
  assert_line --index 2 "STDERR_FIRST=Warning: TS implementation unavailable for command 'version'; falling back to legacy"
}
