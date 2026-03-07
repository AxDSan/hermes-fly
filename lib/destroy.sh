#!/usr/bin/env bash
# lib/destroy.sh — Teardown command
# Sourced by hermes-fly; not executable directly.

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "Error: source this file, do not execute directly." >&2
  exit 1
fi

# --- Source dependencies ---

_DESTROY_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -z "${EXIT_AUTH:-}" ]]; then
  # shellcheck source=./ui.sh disable=SC1091
  source "${_DESTROY_SCRIPT_DIR}/ui.sh" 2>/dev/null || true
fi
if ! command -v fly_destroy_app &>/dev/null; then
  # shellcheck source=./fly-helpers.sh disable=SC1091
  source "${_DESTROY_SCRIPT_DIR}/fly-helpers.sh" 2>/dev/null || true
fi
if ! command -v config_remove_app &>/dev/null; then
  # shellcheck source=./config.sh disable=SC1091
  source "${_DESTROY_SCRIPT_DIR}/config.sh" 2>/dev/null || true
fi

# --------------------------------------------------------------------------
# destroy_cleanup_volumes "app_name" — delete all volumes for an app
# Calls fly_list_volumes, parses JSON for volume IDs, deletes each one.
# --------------------------------------------------------------------------
destroy_cleanup_volumes() {
  local app_name="$1"
  local volumes_json

  volumes_json="$(fly_list_volumes "$app_name")"

  # Extract volume IDs matching vol_ pattern from JSON
  local vol_ids
  vol_ids="$(echo "$volumes_json" | grep -o '"id":"vol_[^"]*"' | sed 's/"id":"//;s/"//' || true)"

  # If no volumes, nothing to do
  if [[ -z "$vol_ids" ]]; then
    return 0
  fi

  local vol_id
  while IFS= read -r vol_id; do
    [[ -n "$vol_id" ]] && fly_delete_volume "$vol_id"
  done <<<"$vol_ids"
}

# --------------------------------------------------------------------------
# destroy_remove_config "app_name" — remove app from local config
# --------------------------------------------------------------------------
destroy_remove_config() {
  local app_name="$1"
  config_remove_app "$app_name"
}

# --------------------------------------------------------------------------
# destroy_telegram_logout "app_name" — disconnect Telegram bot via logOut
# Calls logOut and deleteWebhook via fly ssh console. Fail-open: prints
# manual steps if console is unreachable.
# --------------------------------------------------------------------------
destroy_telegram_logout() {
  local app_name="$1"

  # Skip SSH if machine is stopped — can't exec commands
  local _state
  _state="$(fly_get_machine_state "$app_name" 2>/dev/null)" || _state="unknown"
  if [[ "$_state" == "stopped" ]] || [[ "$_state" == "unknown" ]]; then
    printf 'Note: machine is stopped — cannot disconnect Telegram bot automatically.\n' >&2
    printf 'Manual steps:\n  1. Open @BotFather on Telegram\n' >&2
    printf '  2. /mybots > select bot > Edit Bot > Revoke current token\n' >&2
    printf '  3. Revoke OpenRouter key at: https://openrouter.ai/keys\n' >&2
    return 0
  fi

  printf 'Disconnecting Telegram bot...\n' >&2
  # shellcheck disable=SC2016
  local _logout_cmd='curl -sf "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/logOut" && curl -sf "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook?drop_pending_updates=true"'
  if fly ssh console --app "$app_name" -C "$_logout_cmd" 2>/dev/null; then
    printf 'Telegram bot disconnected\n' >&2
    printf 'Wait 10 min before reusing this bot token with hermes-fly deploy\n' >&2
  else
    printf 'Warning: could not disconnect Telegram bot automatically.\n' >&2
    printf 'Manual steps:\n  1. Open @BotFather on Telegram\n' >&2
    printf '  2. /mybots > select bot > Edit Bot > Revoke current token\n' >&2
    printf '  3. Revoke OpenRouter key at: https://openrouter.ai/keys\n' >&2
  fi
}

# --------------------------------------------------------------------------
# cmd_destroy "app_name" [--force] — main destroy command
# Without app_name: shows interactive selection from config.
# Without --force: prompts for confirmation (must type "yes").
# With --force: skips confirmation prompt.
# --------------------------------------------------------------------------
cmd_destroy() {
  local app_name="${1:-}"
  shift || true
  local force=false

  # Parse remaining args for --force
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --force | -f) force=true ;;
    esac
    shift
  done

  # Interactive selection when no app name provided
  if [[ -z "$app_name" ]]; then
    local apps
    apps="$(config_list_apps)"
    if [[ -z "$apps" ]]; then
      printf 'No deployed agents found.\n' >&2
      return 1
    fi
    printf '\nDeployed agents:\n' >&2
    local i=0 app
    while IFS= read -r app; do
      [[ -z "$app" ]] && continue
      i=$((i + 1))
      printf '  %d) %s\n' "$i" "$app" >&2
    done <<<"$apps"
    printf '  0) Cancel\n\nSelect agent to destroy [0]: ' >&2
    local choice
    IFS= read -r choice
    if [[ -z "$choice" ]] || [[ "$choice" == "0" ]]; then
      printf 'Aborted.\n'
      return 1
    fi
    app_name="$(printf '%s' "$apps" | sed -n "${choice}p")"
    if [[ -z "$app_name" ]]; then
      printf 'Invalid choice.\n'
      return 1
    fi
  fi

  # Confirmation check
  if [[ "$force" != "true" ]]; then
    local answer
    printf "Are you sure you want to destroy %s? Type 'yes' to confirm: " "$app_name"
    IFS= read -r answer
    if [[ "$answer" != "yes" ]]; then
      echo "Aborted."
      return 1
    fi
  fi

  # Telegram cleanup (fail-open)
  destroy_telegram_logout "$app_name" || true

  # Proceed with destruction
  destroy_cleanup_volumes "$app_name"
  if ! fly_destroy_app "$app_name" 2>/dev/null; then
    ui_error "App '$app_name' not found"
    return "${EXIT_RESOURCE:-4}"
  fi
  destroy_remove_config "$app_name"

  ui_success "Destroyed $app_name"
}
