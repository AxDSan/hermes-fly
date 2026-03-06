#!/usr/bin/env bash
# lib/messaging.sh — Telegram/Discord setup wizards
# Sourced by hermes-fly; not executable directly.

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "Error: source this file, do not execute directly." >&2
  exit 1
fi

# --- Source ui.sh for prompts ---
_MESSAGING_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! command -v ui_ask &>/dev/null; then
  # shellcheck source=./ui.sh
  source "${_MESSAGING_SCRIPT_DIR}/ui.sh" 2>/dev/null || true
fi

# --- Validation ---

# Validate Telegram bot token format.
# Valid format: digits, colon, then alphanumeric/hyphen/underscore chars.
# Example: 123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
# Returns 0 if valid, 1 if not.
messaging_validate_telegram_token() {
  local token="${1:-}"
  if [[ "$token" =~ ^[0-9]+:[A-Za-z0-9_-]+$ ]]; then
    return 0
  fi
  return 1
}

# Validate Discord bot token format.
# Valid: non-empty string with at least 20 characters.
# Returns 0 if valid, 1 if not.
messaging_validate_discord_token() {
  local token="${1:-}"
  if [[ -z "$token" ]] || [[ ${#token} -lt 20 ]]; then
    return 1
  fi
  return 0
}

# --- Setup menu ---

# Present a choice menu for messaging platform selection.
# Reads user choice from stdin.
# Echoes: "telegram", "discord", or "skip"
# Returns 0.
messaging_setup_menu() {
  printf '\nMessaging Platform Setup\n' >&2
  printf '  1) Telegram\n' >&2
  printf '  2) Discord\n' >&2
  printf '  3) Skip (no messaging)\n' >&2
  printf 'Choice [1-3]: ' >&2

  local choice
  IFS= read -r choice

  case "$choice" in
    1) echo "telegram" ;;
    2) echo "discord" ;;
    *) echo "skip" ;;
  esac

  return 0
}

# --- Telegram setup ---

# Interactive Telegram bot setup wizard.
# Prompts for bot token and allowed user IDs.
# Sets global vars: DEPLOY_TELEGRAM_BOT_TOKEN, DEPLOY_TELEGRAM_ALLOWED_USERS
# Returns 0 on success.
messaging_setup_telegram() {
  printf '\n--- Telegram Bot Setup ---\n' >&2
  printf 'To create a Telegram bot:\n' >&2
  printf '  1. Open Telegram and search for @BotFather\n' >&2
  printf '  2. Send /newbot and follow the prompts\n' >&2
  printf '  3. Copy the bot token provided\n' >&2
  printf '\n' >&2

  local token
  printf 'Bot token: ' >&2
  IFS= read -r token

  if ! messaging_validate_telegram_token "$token"; then
    printf 'Warning: token format looks invalid, proceeding anyway.\n' >&2
  fi

  local users
  printf 'Allowed user IDs (comma-separated): ' >&2
  IFS= read -r users

  DEPLOY_TELEGRAM_BOT_TOKEN="$token"
  DEPLOY_TELEGRAM_ALLOWED_USERS="$users"
  export DEPLOY_TELEGRAM_BOT_TOKEN DEPLOY_TELEGRAM_ALLOWED_USERS

  return 0
}

# --- Discord setup ---

# Interactive Discord bot setup wizard.
# Prompts for bot token and allowed user IDs.
# Sets global vars: DEPLOY_DISCORD_BOT_TOKEN, DEPLOY_DISCORD_ALLOWED_USERS
# Returns 0 on success.
messaging_setup_discord() {
  printf '\n--- Discord Bot Setup ---\n' >&2
  printf 'To create a Discord bot:\n' >&2
  printf '  1. Go to https://discord.com/developers/applications\n' >&2
  printf '  2. Create a new application and add a bot\n' >&2
  printf '  3. Copy the bot token from the Bot settings page\n' >&2
  printf '\n' >&2

  local token
  printf 'Bot token: ' >&2
  IFS= read -r token

  if ! messaging_validate_discord_token "$token"; then
    printf 'Warning: token format looks invalid, proceeding anyway.\n' >&2
  fi

  local users
  printf 'Allowed user IDs (comma-separated): ' >&2
  IFS= read -r users

  DEPLOY_DISCORD_BOT_TOKEN="$token"
  DEPLOY_DISCORD_ALLOWED_USERS="$users"
  export DEPLOY_DISCORD_BOT_TOKEN DEPLOY_DISCORD_ALLOWED_USERS

  return 0
}
