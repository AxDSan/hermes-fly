#!/usr/bin/env bash
# Shared test setup for all .bats files

_common_setup() {
  load 'test_helper/bats-support/load'
  load 'test_helper/bats-assert/load'

  export PROJECT_ROOT="$(cd "$BATS_TEST_DIRNAME/.." && pwd)"
  PATH="${BATS_TEST_DIRNAME}/mocks:${PATH}"

  TEST_TEMP_DIR="$(mktemp -d)"
  export HERMES_FLY_CONFIG_DIR="${TEST_TEMP_DIR}/config"
  export HERMES_FLY_LOG_DIR="${TEST_TEMP_DIR}/logs"
  mkdir -p "${HERMES_FLY_CONFIG_DIR}" "${HERMES_FLY_LOG_DIR}"
}

_common_teardown() {
  [[ -d "${TEST_TEMP_DIR:-}" ]] && rm -rf "${TEST_TEMP_DIR}"
}
