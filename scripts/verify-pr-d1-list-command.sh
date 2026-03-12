#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${PROJECT_ROOT}"

required_files=(
  "src/adapters/process.ts"
  "src/adapters/flyctl.ts"
  "src/commands/list.ts"
  "src/contexts/runtime/application/ports/deployment-registry.port.ts"
  "src/contexts/runtime/application/use-cases/list-deployments.ts"
  "src/contexts/runtime/infrastructure/adapters/fly-deployment-registry.ts"
  "tests-ts/runtime/list-deployments.test.ts"
  "tests/list-ts-hybrid.bats"
  "scripts/verify-pr-d1-list-command.sh"
)

for file in "${required_files[@]}"; do
  if [[ ! -f "${file}" ]]; then
    printf "Missing required file: %s\n" "${file}" >&2
    exit 1
  fi
done

npm run build
npm run typecheck
npm run arch:ddd-boundaries
npm run test:domain-primitives
npm run test:runtime-list

tests/bats/bin/bats \
  tests/list-ts-hybrid.bats \
  tests/list.bats \
  tests/parity-harness.bats \
  tests/hybrid-dispatch.bats \
  tests/integration.bats

npm run build

tmp="$(mktemp -d)"
trap 'rm -rf "${tmp}"' EXIT
mkdir -p "${tmp}/config" "${tmp}/logs"

PATH="tests/mocks:${PATH}" HERMES_FLY_CONFIG_DIR="${tmp}/config" HERMES_FLY_LOG_DIR="${tmp}/logs" \
  TMP_DIR="${tmp}" bash -c '
    source ./lib/config.sh
    config_save_app "test-app" "ord"
    HERMES_FLY_IMPL_MODE=hybrid HERMES_FLY_TS_COMMANDS=list ./hermes-fly list >"${TMP_DIR}/out" 2>"${TMP_DIR}/err"
    printf "%s\n" "$?" >"${TMP_DIR}/exit"
  '

diff -u tests/parity/baseline/list.stdout.snap "${tmp}/out"
diff -u tests/parity/baseline/list.stderr.snap "${tmp}/err"
diff -u tests/parity/baseline/list.exit.snap "${tmp}/exit"

printf 'PR-D1 verification passed.\n'
