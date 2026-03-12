#!/usr/bin/env bash
set -euo pipefail

BASELINE_DIR=""
CANDIDATE_DIR=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --baseline)
      if [[ $# -lt 2 || -z "${2:-}" ]]; then
        echo "Error: --baseline requires a path" >&2
        exit 1
      fi
      BASELINE_DIR="$2"
      shift 2
      ;;
    --candidate)
      if [[ $# -lt 2 || -z "${2:-}" ]]; then
        echo "Error: --candidate requires a path" >&2
        exit 1
      fi
      CANDIDATE_DIR="$2"
      shift 2
      ;;
    *)
      echo "Error: unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$BASELINE_DIR" || -z "$CANDIDATE_DIR" ]]; then
  echo "Error: --baseline and --candidate are required" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCENARIO_FILE="$REPO_ROOT/tests/parity/scenarios/non_destructive_commands.list"

failed=0
expected_snaps=""
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

  for stream in stdout stderr exit; do
    snap_name="$scenario.$stream.snap"
    baseline_file="$BASELINE_DIR/$snap_name"
    candidate_file="$CANDIDATE_DIR/$snap_name"
    expected_snaps+="$snap_name"$'\n'

    if [[ ! -f "$baseline_file" || ! -f "$candidate_file" ]]; then
      echo "Missing snapshot: $snap_name"
      failed=1
      continue
    fi

    if ! cmp -s "$baseline_file" "$candidate_file"; then
      echo "Mismatch: $snap_name"
      diff -u --label "baseline/$snap_name" --label "candidate/$snap_name" "$baseline_file" "$candidate_file" || true
      failed=1
    fi
  done
done <"$SCENARIO_FILE"

for side in baseline candidate; do
  if [[ "$side" == "baseline" ]]; then
    dir="$BASELINE_DIR"
  else
    dir="$CANDIDATE_DIR"
  fi

  while IFS= read -r snap_path; do
    [[ -z "$snap_path" ]] && continue
    snap_file="$(basename "$snap_path")"
    if ! printf '%s' "$expected_snaps" | grep -Fx -- "$snap_file" >/dev/null; then
      echo "Unexpected snapshot: $snap_file ($side)"
      failed=1
    fi
  done < <(find "$dir" -maxdepth 1 -type f -name '*.snap' | sort)
done

if [[ "$failed" -ne 0 ]]; then
  exit 1
fi

echo "Parity compare passed."
