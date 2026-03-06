#!/usr/bin/env bats
# tests/messaging.bats — Tests for lib/messaging.sh messaging setup wizards

setup() {
  load 'test_helper/common-setup'
  _common_setup
  export NO_COLOR=1
  source "${PROJECT_ROOT}/lib/ui.sh"
  source "${PROJECT_ROOT}/lib/messaging.sh"
}

teardown() {
  _common_teardown
}

# --- messaging_validate_telegram_token ---

@test "messaging_validate_telegram_token accepts valid token" {
  run messaging_validate_telegram_token "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
  assert_success
}

@test "messaging_validate_telegram_token rejects invalid token" {
  run messaging_validate_telegram_token "invalid"
  assert_failure
}

@test "messaging_validate_telegram_token rejects empty" {
  run messaging_validate_telegram_token ""
  assert_failure
}

# --- messaging_validate_discord_token ---

@test "messaging_validate_discord_token accepts valid token" {
  run messaging_validate_discord_token "MTIzNDU2Nzg5MDEyMzQ1Njc4.GhIjKl.abcdefghijklmnopqrstuvwxyz1234567890AB"
  assert_success
}

@test "messaging_validate_discord_token rejects empty" {
  run messaging_validate_discord_token ""
  assert_failure
}

@test "messaging_validate_discord_token rejects short token" {
  run messaging_validate_discord_token "tooshort"
  assert_failure
}

# --- messaging_validate_user_ids ---

@test "messaging_validate_user_ids accepts numeric IDs" {
  run messaging_validate_user_ids "12345"
  assert_success
}

@test "messaging_validate_user_ids accepts comma-separated numeric IDs" {
  run messaging_validate_user_ids "12345,67890"
  assert_success
}

@test "messaging_validate_user_ids rejects non-numeric input" {
  run messaging_validate_user_ids "alexfazio"
  assert_failure
}

@test "messaging_validate_user_ids accepts empty input" {
  run messaging_validate_user_ids ""
  assert_success
}

# --- messaging_setup_menu ---

@test "messaging_setup_menu renders as box-drawing table" {
  run bash -c 'export NO_COLOR=1; source lib/ui.sh; source lib/messaging.sh; echo "1" | messaging_setup_menu 2>&1'
  assert_success
  assert_output --partial "┌"
  assert_output --partial "Platform"
  assert_output --partial "Telegram"
}

@test "messaging_setup_menu with 1 returns telegram" {
  run bash -c 'export NO_COLOR=1; source lib/ui.sh; source lib/messaging.sh; echo "1" | messaging_setup_menu 2>/dev/null'
  assert_success
  assert_output --partial "telegram"
}

@test "messaging_setup_menu with 3 returns skip" {
  run bash -c 'export NO_COLOR=1; source lib/ui.sh; source lib/messaging.sh; echo "3" | messaging_setup_menu 2>/dev/null'
  assert_success
  assert_output --partial "skip"
}

# --- messaging_setup_telegram ---

@test "messaging_setup_telegram shows how to find user ID" {
  run bash -c 'export NO_COLOR=1; source lib/ui.sh; source lib/messaging.sh; messaging_setup_telegram < <(printf "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11\n12345\n") 2>&1'
  assert_success
  assert_output --partial "@userinfobot"
}

@test "messaging_setup_telegram sets token and users" {
  run bash -c 'export NO_COLOR=1; source lib/ui.sh; source lib/messaging.sh; messaging_setup_telegram <<EOF 2>/dev/null
123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
12345,67890
EOF
echo "TOKEN=$DEPLOY_TELEGRAM_BOT_TOKEN USERS=$DEPLOY_TELEGRAM_ALLOWED_USERS"'
  assert_success
  assert_output --partial "TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
  assert_output --partial "USERS=12345,67890"
}

@test "messaging_setup_telegram warns on non-numeric user IDs" {
  run bash -c 'export NO_COLOR=1; source lib/ui.sh; source lib/messaging.sh; messaging_setup_telegram < <(printf "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11\nalexfazio\n") 2>&1'
  assert_success
  assert_output --partial "user IDs should be numeric"
}

@test "messaging_setup_telegram still captures token with masked input" {
  run bash -c 'export NO_COLOR=1; source lib/ui.sh; source lib/messaging.sh; messaging_setup_telegram <<EOF 2>/dev/null
123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
12345
EOF
echo "TOKEN=$DEPLOY_TELEGRAM_BOT_TOKEN"'
  assert_success
  assert_output --partial "TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
}

@test "messaging_setup_telegram allows empty user IDs" {
  run bash -c 'export NO_COLOR=1; source lib/ui.sh; source lib/messaging.sh; messaging_setup_telegram <<EOF 2>/dev/null
123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11

EOF
echo "TOKEN=$DEPLOY_TELEGRAM_BOT_TOKEN USERS=[$DEPLOY_TELEGRAM_ALLOWED_USERS]"'
  assert_success
  assert_output --partial "TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
  assert_output --partial "USERS=[]"
}

# --- messaging_setup_discord ---

@test "messaging_setup_discord shows how to find user ID" {
  run bash -c 'export NO_COLOR=1; source lib/ui.sh; source lib/messaging.sh; messaging_setup_discord < <(printf "MTIzNDU2Nzg5MDEyMzQ1Njc4.GhIjKl.abcdefghijklmnopqrstuvwxyz1234567890AB\n111222\n") 2>&1'
  assert_success
  assert_output --partial "Developer Mode"
}

@test "messaging_setup_discord sets token and users" {
  run bash -c 'export NO_COLOR=1; source lib/ui.sh; source lib/messaging.sh; messaging_setup_discord <<EOF 2>/dev/null
MTIzNDU2Nzg5MDEyMzQ1Njc4.GhIjKl.abcdefghijklmnopqrstuvwxyz1234567890AB
111222,333444
EOF
echo "TOKEN=$DEPLOY_DISCORD_BOT_TOKEN USERS=$DEPLOY_DISCORD_ALLOWED_USERS"'
  assert_success
  assert_output --partial "TOKEN=MTIzNDU2Nzg5MDEyMzQ1Njc4.GhIjKl.abcdefghijklmnopqrstuvwxyz1234567890AB"
  assert_output --partial "USERS=111222,333444"
}

@test "messaging_setup_discord warns on non-numeric user IDs" {
  run bash -c 'export NO_COLOR=1; source lib/ui.sh; source lib/messaging.sh; messaging_setup_discord < <(printf "MTIzNDU2Nzg5MDEyMzQ1Njc4.GhIjKl.abcdefghijklmnopqrstuvwxyz1234567890AB\nmyuser\n") 2>&1'
  assert_success
  assert_output --partial "user IDs should be numeric"
}

@test "messaging_setup_discord still captures token with masked input" {
  run bash -c 'export NO_COLOR=1; source lib/ui.sh; source lib/messaging.sh; messaging_setup_discord <<EOF 2>/dev/null
MTIzNDU2Nzg5MDEyMzQ1Njc4.GhIjKl.abcdefghijklmnopqrstuvwxyz1234567890AB
111222
EOF
echo "TOKEN=$DEPLOY_DISCORD_BOT_TOKEN"'
  assert_success
  assert_output --partial "TOKEN=MTIzNDU2Nzg5MDEyMzQ1Njc4.GhIjKl.abcdefghijklmnopqrstuvwxyz1234567890AB"
}

@test "messaging_setup_discord allows empty user IDs" {
  run bash -c 'export NO_COLOR=1; source lib/ui.sh; source lib/messaging.sh; messaging_setup_discord <<EOF 2>/dev/null
MTIzNDU2Nzg5MDEyMzQ1Njc4.GhIjKl.abcdefghijklmnopqrstuvwxyz1234567890AB

EOF
echo "TOKEN=$DEPLOY_DISCORD_BOT_TOKEN USERS=[$DEPLOY_DISCORD_ALLOWED_USERS]"'
  assert_success
  assert_output --partial "USERS=[]"
}
