#!/usr/bin/env bash
set -euo pipefail

OUT_DIR=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --out-dir)
      if [[ $# -lt 2 || -z "${2:-}" ]]; then
        echo "Error: --out-dir requires a path" >&2
        exit 1
      fi
      OUT_DIR="$2"
      shift 2
      ;;
    *)
      echo "Error: unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$OUT_DIR" ]]; then
  echo "Error: --out-dir is required" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCENARIO_FILE="$REPO_ROOT/tests/parity/scenarios/non_destructive_commands.list"

mkdir -p "$OUT_DIR"

export NO_COLOR=1
export LC_ALL=C
export TZ=UTC
export PATH="$REPO_ROOT/tests/mocks:$PATH"
export HERMES_FLY_IMPL_MODE=legacy
unset HERMES_FLY_TS_COMMANDS

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
export HERMES_FLY_CONFIG_DIR="$TMP_DIR/config"
export HERMES_FLY_LOG_DIR="$TMP_DIR/logs"
mkdir -p "$HERMES_FLY_CONFIG_DIR" "$HERMES_FLY_LOG_DIR"

source "$REPO_ROOT/lib/config.sh"
config_save_app "test-app" "ord"

line_no=0
while IFS= read -r line || [[ -n "$line" ]]; do
  line_no=$((line_no + 1))
  pipe_count="$(printf '%s' "$line" | tr -cd '|' | wc -c | tr -d '[:space:]')"
  if [[ "$pipe_count" -ne 1 ]]; then
    echo "Invalid scenario line $line_no: $line" >&2
    exit 1
  fi

  scenario="${line%%|*}"
  args_str="${line#*|}"
  if [[ -z "${scenario}" || -z "${args_str//[[:space:]]/}" ]]; then
    echo "Invalid scenario line $line_no: $line" >&2
    exit 1
  fi
  read -r -a args <<<"$args_str"

  stdout_snap="$OUT_DIR/$scenario.stdout.snap"
  stderr_snap="$OUT_DIR/$scenario.stderr.snap"
  exit_snap="$OUT_DIR/$scenario.exit.snap"

  set +e
  (
    cd "$REPO_ROOT"
    ./hermes-fly "${args[@]}"
  ) >"$stdout_snap" 2>"$stderr_snap"
  exit_code=$?
  set -e

  printf '%s\n' "$exit_code" >"$exit_snap"
done <"$SCENARIO_FILE"

echo "Parity capture completed: $OUT_DIR"
