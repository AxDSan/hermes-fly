#!/bin/bash
set -euo pipefail

RUNTIME_DIR="/root/.hermes/runtime"
SUPERVISOR_PID_FILE="${RUNTIME_DIR}/gateway-supervisor.pid"
CHILD_PID_FILE="${RUNTIME_DIR}/gateway.pid"
STARTED_AT_FILE="${RUNTIME_DIR}/gateway-started-at"

mkdir -p "${RUNTIME_DIR}"

child_pid=""
restart_requested=0
shutdown_requested=0

cleanup() {
  rm -f "${SUPERVISOR_PID_FILE}" "${CHILD_PID_FILE}"
}

request_restart() {
  restart_requested=1
  if [[ -n "${child_pid}" ]] && kill -0 "${child_pid}" 2>/dev/null; then
    kill -TERM "${child_pid}" 2>/dev/null || true
  fi
}

request_shutdown() {
  shutdown_requested=1
  if [[ -n "${child_pid}" ]] && kill -0 "${child_pid}" 2>/dev/null; then
    kill -TERM "${child_pid}" 2>/dev/null || true
  fi
}

start_gateway() {
  printf '%s\n' "$$" > "${SUPERVISOR_PID_FILE}"
  /opt/hermes/hermes-agent/venv/bin/hermes gateway run --replace "$@" &
  child_pid="$!"
  printf '%s\n' "${child_pid}" > "${CHILD_PID_FILE}"
  date +%s%N > "${STARTED_AT_FILE}"
}

trap cleanup EXIT
trap request_restart USR1
trap request_shutdown TERM INT

while true; do
  start_gateway "$@"

  set +e
  wait "${child_pid}"
  child_status=$?
  set -e

  rm -f "${CHILD_PID_FILE}"

  if [[ "${shutdown_requested}" -eq 1 ]]; then
    exit "${child_status}"
  fi

  if [[ "${restart_requested}" -eq 1 ]]; then
    restart_requested=0
    child_pid=""
    continue
  fi

  exit "${child_status}"
done
