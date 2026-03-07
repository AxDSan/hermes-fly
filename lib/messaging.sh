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
  # shellcheck source=./ui.sh disable=SC1091
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

# Validate user IDs are numeric (comma-separated).
# Empty input is valid (allow all users).
# Returns 0 if valid, 1 if any ID is non-numeric.
messaging_validate_user_ids() {
  local input="$1"
  [[ -z "$input" ]] && return 0
  local id
  local IFS=','
  for id in $input; do
    id="$(printf '%s' "$id" | tr -d '[:space:]')"
    if [[ -n "$id" ]] && ! [[ "$id" =~ ^[0-9]+$ ]]; then
      return 1
    fi
  done
  return 0
}

# --- Setup menu ---

# Present a choice menu for messaging platform selection.
# Reads user choice from stdin.
# Echoes: "telegram", "discord", or "skip"
# Returns 0.
messaging_setup_menu() {
  printf '\nMessaging Platform Setup\n' >&2
  printf '  ┌───┬──────────┬────────────────────────────────┐\n' >&2
  printf '  │ # │ Platform │ Description                    │\n' >&2
  printf '  ├───┼──────────┼────────────────────────────────┤\n' >&2
  printf '  │ 1 │ Telegram │ chat bot via @BotFather        │\n' >&2
  printf '  │ 2 │ Discord  │ server bot via Developer Portal│\n' >&2
  printf '  │ 3 │ Skip     │ configure later                │\n' >&2
  printf '  └───┴──────────┴────────────────────────────────┘\n' >&2
  local choice
  while true; do
    printf 'Choice [3]: ' >&2
    IFS= read -r choice
    [[ -z "$choice" ]] && choice=3
    case "$choice" in
      1)
        echo "telegram"
        return 0
        ;;
      2)
        echo "discord"
        return 0
        ;;
      3)
        echo "skip"
        return 0
        ;;
      *) printf 'Invalid choice. Please enter 1, 2, or 3.\n' >&2 ;;
    esac
  done
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
  ui_ask_secret 'Bot token:' token

  if ! messaging_validate_telegram_token "$token"; then
    printf 'Warning: token format looks invalid, proceeding anyway.\n' >&2
  fi

  printf '\nTo find your Telegram user ID:\n' >&2
  printf '  1. Message @userinfobot on Telegram\n' >&2
  printf '  2. It replies with your numeric user ID\n' >&2
  printf 'Only these IDs can interact with the bot.\n' >&2
  printf 'Leave blank to allow all users.\n' >&2

  local users
  printf 'User IDs (comma-separated, or blank for all): ' >&2
  IFS= read -r users

  if ! messaging_validate_user_ids "$users"; then
    printf 'Warning: user IDs should be numeric (e.g., 123456789). Proceeding anyway.\n' >&2
  fi

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
  ui_ask_secret 'Bot token:' token

  if ! messaging_validate_discord_token "$token"; then
    printf 'Warning: token format looks invalid, proceeding anyway.\n' >&2
  fi

  printf '\nTo find your Discord user ID:\n' >&2
  printf '  1. Enable Developer Mode in Discord settings\n' >&2
  printf '     (Settings > Advanced > Developer Mode)\n' >&2
  printf '  2. Right-click your name and select "Copy User ID"\n' >&2
  printf 'Only these IDs can interact with the bot.\n' >&2
  printf 'Leave blank to allow all users.\n' >&2

  local users
  printf 'User IDs (comma-separated, or blank for all): ' >&2
  IFS= read -r users

  if ! messaging_validate_user_ids "$users"; then
    printf 'Warning: user IDs should be numeric (e.g., 123456789). Proceeding anyway.\n' >&2
  fi

  DEPLOY_DISCORD_BOT_TOKEN="$token"
  DEPLOY_DISCORD_ALLOWED_USERS="$users"
  export DEPLOY_DISCORD_BOT_TOKEN DEPLOY_DISCORD_ALLOWED_USERS

  return 0
}
