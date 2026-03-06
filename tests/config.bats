#!/usr/bin/env bats
# tests/config.bats — Tests for lib/config.sh app config management

setup() {
  load 'test_helper/common-setup'
  _common_setup
  source "${PROJECT_ROOT}/lib/config.sh"
}

teardown() {
  _common_teardown
}

# --- config_init ---

@test "config_init creates config directory and file" {
  # Remove the pre-created dir so init has work to do
  rm -rf "${HERMES_FLY_CONFIG_DIR}"
  run config_init
  assert_success
  [[ -d "${HERMES_FLY_CONFIG_DIR}" ]]
  [[ -f "${HERMES_FLY_CONFIG_DIR}/config.yaml" ]]
}

# --- config_save_app ---

@test "config_save_app creates config with current_app" {
  config_save_app "test-app" "ord"
  run cat "${HERMES_FLY_CONFIG_DIR}/config.yaml"
  assert_output --partial "current_app: test-app"
  assert_output --partial "name: test-app"
  assert_output --partial "region: ord"
}

@test "config_save_app with two apps updates current_app" {
  config_save_app "app-one" "ord"
  config_save_app "app-two" "iad"
  run config_get_current_app
  assert_output "app-two"
  run config_list_apps
  assert_output --partial "app-one"
  assert_output --partial "app-two"
}

# --- config_get_current_app ---

@test "config_get_current_app returns app name" {
  config_save_app "my-app" "ord"
  run config_get_current_app
  assert_success
  assert_output "my-app"
}

@test "config_get_current_app returns empty when no config" {
  rm -f "${HERMES_FLY_CONFIG_DIR}/config.yaml"
  run config_get_current_app
  assert_success
  assert_output ""
}

# --- config_list_apps ---

@test "config_list_apps lists all apps" {
  config_save_app "alpha" "ord"
  config_save_app "beta" "iad"
  run config_list_apps
  assert_success
  assert_output --partial "alpha"
  assert_output --partial "beta"
}

# --- config_remove_app ---

@test "config_remove_app removes entry" {
  config_save_app "first" "ord"
  config_save_app "second" "iad"
  config_remove_app "first"
  run config_list_apps
  assert_output --partial "second"
  refute_output --partial "first"
}

@test "config_remove_app clears current_app when removing it" {
  config_save_app "only-app" "ord"
  config_remove_app "only-app"
  run config_get_current_app
  assert_success
  assert_output ""
}

# --- config_resolve_app ---

@test "config_resolve_app with -a flag returns flag value" {
  run config_resolve_app -a "my-app"
  assert_success
  assert_output "my-app"
}

@test "config_resolve_app without flag returns current_app" {
  config_save_app "saved-app" "ord"
  run config_resolve_app
  assert_success
  assert_output "saved-app"
}

@test "config_resolve_app with no config and no flag fails" {
  rm -f "${HERMES_FLY_CONFIG_DIR}/config.yaml"
  run config_resolve_app
  assert_failure
  assert_output ""
}

# --- config_get_current_app corruption hardening ---

@test "config_get_current_app returns empty on binary-corrupted config" {
  printf '\x00\x01\x02binary garbage\xff\xfe' > "${HERMES_FLY_CONFIG_DIR}/config.yaml"
  run config_get_current_app
  assert_success
  assert_output ""
}

@test "config_get_current_app returns empty on missing current_app line" {
  echo "random_key: some_value" > "${HERMES_FLY_CONFIG_DIR}/config.yaml"
  run config_get_current_app
  assert_success
  assert_output ""
}

@test "config_get_current_app rejects value with spaces or special chars" {
  echo 'current_app: evil; rm -rf /' > "${HERMES_FLY_CONFIG_DIR}/config.yaml"
  run config_get_current_app
  assert_success
  assert_output ""
}

@test "config_get_current_app accepts valid app names with dots and hyphens" {
  echo 'current_app: my-app.v2' > "${HERMES_FLY_CONFIG_DIR}/config.yaml"
  run config_get_current_app
  assert_success
  assert_output "my-app.v2"
}

@test "config_get_current_app uses first match when duplicated" {
  printf 'current_app: first-app\ncurrent_app: second-app\n' > "${HERMES_FLY_CONFIG_DIR}/config.yaml"
  run config_get_current_app
  assert_success
  assert_output "first-app"
}

# --- config_list_apps corruption hardening ---

@test "config_list_apps returns empty on corrupted config file" {
  printf '\x00\x01\x02binary garbage\xff\xfe' > "${HERMES_FLY_CONFIG_DIR}/config.yaml"
  run config_list_apps
  assert_success
  assert_output ""
}

@test "config_list_apps filters out names with special characters" {
  cat > "${HERMES_FLY_CONFIG_DIR}/config.yaml" <<'EOF'
apps:
  - name: good-app
    region: ord
    deployed_at: 2026-01-01T00:00:00Z
  - name: evil; rm -rf /
    region: ord
    deployed_at: 2026-01-01T00:00:00Z
  - name: also_good.v2
    region: iad
    deployed_at: 2026-01-01T00:00:00Z
EOF
  run config_list_apps
  assert_success
  assert_output --partial "good-app"
  assert_output --partial "also_good.v2"
  refute_output --partial "evil"
}
