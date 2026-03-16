#!/usr/bin/env bash
# lib/list.sh — List deployed agents
# Sourced by hermes-fly; not executable directly.

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  printf 'Error: source this file, do not execute directly.\n' >&2
  exit 1
fi

# Truncate string to max length, appending "..." if truncated
_truncate() {
  local str="$1" max="$2"
  if [[ ${#str} -gt $max ]]; then
    printf '%s...' "${str:0:$((max - 3))}"
  else
    printf '%s' "$str"
  fi
}

# --------------------------------------------------------------------------
# cmd_list — show table of all deployed agents from local config
# --------------------------------------------------------------------------
cmd_list() {
  local apps
  apps="$(config_list_apps)"
  if [[ -z "$apps" ]]; then
    printf 'No deployed agents found. Run: hermes-fly deploy\n'
    return 0
  fi

  printf '  %-26s %-8s %-10s %-9s\n' "App Name" "Region" "Platform" "Machine"
  printf '  %-26s %-8s %-10s %-9s\n' "--------------------------" "------" "--------" "-------"

  local app
  while IFS= read -r app; do
    [[ -z "$app" ]] && continue
    # Extract region from config.yaml
    local config_file region platform machine
    config_file="$(_config_file)"
    region="$(grep -A3 "  - name: ${app}$" "$config_file" 2>/dev/null \
      | grep "region:" | sed 's/.*region:[[:space:]]*//' | head -1)"
    # Extract platform from deploy YAML
    local deploy_yaml="${HERMES_FLY_CONFIG_DIR:-$HOME/.hermes-fly}/deploys/${app}.yaml"
    if [[ -f "$deploy_yaml" ]]; then
      platform="$(grep "platform:" "$deploy_yaml" 2>/dev/null \
        | sed 's/.*platform:[[:space:]]*//' | head -1)"
    else
      platform="-"
    fi
    # Get live machine state
    machine="$(fly_get_machine_state "$app" 2>/dev/null || printf '?')"
    [[ -z "$machine" ]] && machine="?"
    local display_app
    display_app="$(_truncate "$app" 26)"
    printf '  %-26s %-8s %-10s %-9s\n' "$display_app" "${region:-?}" "${platform:-?}" "$machine"
  done <<<"$apps"
}
