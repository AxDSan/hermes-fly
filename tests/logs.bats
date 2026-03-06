#!/usr/bin/env bats
# tests/logs.bats — Tests for lib/logs.sh logs command

setup() {
  load 'test_helper/common-setup'
  _common_setup
  source "${PROJECT_ROOT}/lib/ui.sh"
  source "${PROJECT_ROOT}/lib/fly-helpers.sh"
  source "${PROJECT_ROOT}/lib/logs.sh"
}

teardown() {
  _common_teardown
}

# --- cmd_logs ---

@test "cmd_logs outputs log lines" {
  run cmd_logs "test-app"
  assert_success
  assert_output --partial "Hermes gateway started"
}

@test "cmd_logs with nonexistent app exits 1" {
  export MOCK_FLY_LOGS=fail
  run cmd_logs "bad-app"
  assert_failure
}
