#!/usr/bin/env bash
# lib/logs.sh — Logs command
# Sourced by hermes-fly; not executable directly.

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "Error: source this file, do not execute directly." >&2
  exit 1
fi

# Source dependencies
_LOGS_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -z "${EXIT_AUTH:-}" ]]; then
  # shellcheck source=./ui.sh
  source "${_LOGS_SCRIPT_DIR}/ui.sh" 2>/dev/null || true
fi
if ! command -v fly_logs &>/dev/null; then
  # shellcheck source=./fly-helpers.sh
  source "${_LOGS_SCRIPT_DIR}/fly-helpers.sh" 2>/dev/null || true
fi

# --------------------------------------------------------------------------
# cmd_logs "app_name" [extra_args...] — wrap fly_logs
# Calls fly_logs with the app name and any extra args.
# On failure, prints error via ui_error and exits 1.
# --------------------------------------------------------------------------
cmd_logs() {
  local app="$1"
  shift
  if ! fly_logs "$app" "$@"; then
    ui_error "Failed to fetch logs for app '${app}'"
    return 1
  fi
}
