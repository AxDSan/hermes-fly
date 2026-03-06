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
# cmd_destroy "app_name" [--force] — main destroy command
# Without --force: prompts for confirmation (must type "yes").
# With --force: skips confirmation prompt.
# --------------------------------------------------------------------------
cmd_destroy() {
  local app_name="$1"
  shift
  local force=false

  # Parse remaining args for --force
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --force) force=true ;;
    esac
    shift
  done

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

  # Proceed with destruction
  destroy_cleanup_volumes "$app_name"
  if ! fly_destroy_app "$app_name" 2>/dev/null; then
    ui_error "App '$app_name' not found"
    return "${EXIT_RESOURCE:-4}"
  fi
  destroy_remove_config "$app_name"

  ui_success "Destroyed $app_name"
}
