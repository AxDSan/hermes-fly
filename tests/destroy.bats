#!/usr/bin/env bats
# tests/destroy.bats — Tests for lib/destroy.sh teardown command

setup() {
  load 'test_helper/common-setup'
  _common_setup
  source "${PROJECT_ROOT}/lib/ui.sh"
  source "${PROJECT_ROOT}/lib/fly-helpers.sh"
  source "${PROJECT_ROOT}/lib/config.sh"
  source "${PROJECT_ROOT}/lib/destroy.sh"
}

teardown() {
  _common_teardown
}

# --- cmd_destroy confirmation ---

@test "cmd_destroy with yes confirmation proceeds" {
  config_save_app "test-app" "ord"
  run bash -c '
    source "'"${PROJECT_ROOT}"'/lib/ui.sh"
    source "'"${PROJECT_ROOT}"'/lib/fly-helpers.sh"
    source "'"${PROJECT_ROOT}"'/lib/config.sh"
    source "'"${PROJECT_ROOT}"'/lib/destroy.sh"
    export HERMES_FLY_CONFIG_DIR="'"${HERMES_FLY_CONFIG_DIR}"'"
    export PATH="'"${BATS_TEST_DIRNAME}"'/mocks:${PATH}"
    echo "yes" | cmd_destroy "test-app"
  '
  assert_success
}

@test "cmd_destroy with no does NOT destroy" {
  run bash -c '
    source "'"${PROJECT_ROOT}"'/lib/ui.sh"
    source "'"${PROJECT_ROOT}"'/lib/fly-helpers.sh"
    source "'"${PROJECT_ROOT}"'/lib/config.sh"
    source "'"${PROJECT_ROOT}"'/lib/destroy.sh"
    export HERMES_FLY_CONFIG_DIR="'"${HERMES_FLY_CONFIG_DIR}"'"
    export PATH="'"${BATS_TEST_DIRNAME}"'/mocks:${PATH}"
    echo "no" | cmd_destroy "test-app"
  '
  assert_failure
  assert_output --partial "Aborted"
}

@test "cmd_destroy with empty input aborts" {
  run bash -c '
    source "'"${PROJECT_ROOT}"'/lib/ui.sh"
    source "'"${PROJECT_ROOT}"'/lib/fly-helpers.sh"
    source "'"${PROJECT_ROOT}"'/lib/config.sh"
    source "'"${PROJECT_ROOT}"'/lib/destroy.sh"
    export HERMES_FLY_CONFIG_DIR="'"${HERMES_FLY_CONFIG_DIR}"'"
    export PATH="'"${BATS_TEST_DIRNAME}"'/mocks:${PATH}"
    echo "" | cmd_destroy "test-app"
  '
  assert_failure
}

# --- cmd_destroy --force ---

@test "cmd_destroy --force skips confirmation" {
  config_save_app "test-app" "ord"
  run cmd_destroy "test-app" "--force"
  assert_success
}

# --- destroy_cleanup_volumes ---

@test "destroy_cleanup_volumes deletes volumes" {
  run destroy_cleanup_volumes "test-app"
  assert_success
}

@test "destroy_cleanup_volumes handles no volumes" {
  export MOCK_FLY_VOLUMES_EMPTY=true
  run destroy_cleanup_volumes "test-app"
  assert_success
}

# --- cmd_destroy resource not found ---

@test "cmd_destroy returns exit 4 when app does not exist" {
  run bash -c '
    source "'"${PROJECT_ROOT}"'/lib/ui.sh"
    source "'"${PROJECT_ROOT}"'/lib/fly-helpers.sh"
    source "'"${PROJECT_ROOT}"'/lib/config.sh"
    source "'"${PROJECT_ROOT}"'/lib/destroy.sh"
    export HERMES_FLY_CONFIG_DIR="'"${HERMES_FLY_CONFIG_DIR}"'"
    export PATH="'"${BATS_TEST_DIRNAME}"'/mocks:${PATH}"
    export MOCK_FLY_APPS_DESTROY=fail
    echo "yes" | cmd_destroy "nonexistent-app"
  '
  assert_failure
  [[ "$status" -eq 4 ]]
  assert_output --partial "not found"
}

# --- Interactive destroy ---

@test "cmd_destroy interactive shows app selection when no app specified" {
  run bash -c '
    source "'"${PROJECT_ROOT}"'/lib/ui.sh"
    source "'"${PROJECT_ROOT}"'/lib/fly-helpers.sh"
    source "'"${PROJECT_ROOT}"'/lib/config.sh"
    source "'"${PROJECT_ROOT}"'/lib/destroy.sh"
    export HERMES_FLY_CONFIG_DIR="'"${HERMES_FLY_CONFIG_DIR}"'"
    export PATH="'"${BATS_TEST_DIRNAME}"'/mocks:${PATH}"
    config_save_app "agent-one" "ams"
    config_save_app "agent-two" "ord"
    printf "0\n" | cmd_destroy "" 2>&1
  '
  assert_output --partial "agent-one"
  assert_output --partial "agent-two"
}

# --- destroy_telegram_logout ---

@test "destroy_telegram_logout calls logOut and prints cooldown warning" {
  run bash -c 'export NO_COLOR=1; export PATH="'"${BATS_TEST_DIRNAME}/mocks:${PATH}"'";
    source '"${PROJECT_ROOT}"'/lib/ui.sh; source '"${PROJECT_ROOT}"'/lib/fly-helpers.sh;
    source '"${PROJECT_ROOT}"'/lib/destroy.sh;
    destroy_telegram_logout "test-app" 2>&1'
  assert_success
  assert_output --partial "10 min"
}

@test "destroy_telegram_logout skips SSH on stopped machine" {
  run bash -c 'export NO_COLOR=1; export PATH="'"${BATS_TEST_DIRNAME}/mocks:${PATH}"'";
    export MOCK_FLY_MACHINE_STATE=stopped;
    source '"${PROJECT_ROOT}"'/lib/ui.sh; source '"${PROJECT_ROOT}"'/lib/fly-helpers.sh;
    source '"${PROJECT_ROOT}"'/lib/destroy.sh;
    destroy_telegram_logout "test-app" 2>&1'
  assert_output --partial "machine is stopped"
  assert_output --partial "BotFather"
}

@test "destroy_telegram_logout prints manual BotFather steps on failure" {
  run bash -c 'export NO_COLOR=1; export PATH="'"${BATS_TEST_DIRNAME}/mocks:${PATH}"'";
    export MOCK_CURL_FAIL=true;
    source '"${PROJECT_ROOT}"'/lib/ui.sh; source '"${PROJECT_ROOT}"'/lib/fly-helpers.sh;
    source '"${PROJECT_ROOT}"'/lib/destroy.sh;
    destroy_telegram_logout "test-app" 2>&1'
  assert_output --partial "BotFather"
}
