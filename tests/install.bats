#!/usr/bin/env bats
# tests/install.bats — TDD tests for scripts/install.sh

setup() {
  load 'test_helper/common-setup'
  _common_setup
  source "${PROJECT_ROOT}/scripts/install.sh"
}

teardown() {
  _common_teardown
}

write_source_checkout() {
  local dest="$1"

  mkdir -p "$dest/templates" "$dest/data"
  cat > "$dest/hermes-fly" <<'MOCK'
#!/bin/sh
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)"
exec node "${SCRIPT_DIR}/dist/cli.js" "$@"
MOCK
  chmod +x "$dest/hermes-fly"

  cat > "$dest/package.json" <<'JSON'
{"name":"hermes-fly","type":"module","dependencies":{"commander":"^12.1.0"},"scripts":{"build":"tsc -p tsconfig.json"}}
JSON
  cat > "$dest/package-lock.json" <<'JSON'
{"name":"hermes-fly","lockfileVersion":3}
JSON
  echo 'tpl' > "$dest/templates/Dockerfile.template"
  echo '{}' > "$dest/data/reasoning-snapshot.json"
}

write_mock_npm() {
  local mock_dir="$1"

  cat > "$mock_dir/npm" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "${MOCK_NPM_ARGS_FILE}"
if [[ -n "${MOCK_NPM_ENV_FILE:-}" ]]; then
  {
    printf 'BASH_ENV=%s\n' "${BASH_ENV:-}"
    printf 'ENV=%s\n' "${ENV:-}"
    printf 'LANG=%s\n' "${LANG:-}"
    printf 'LC_ALL=%s\n' "${LC_ALL:-}"
  } >> "${MOCK_NPM_ENV_FILE}"
fi
if [[ "${1:-}" == "ci" ]]; then
  mkdir -p "$PWD/node_modules/commander"
  echo '{"name":"commander"}' > "$PWD/node_modules/commander/package.json"
  exit 0
fi
if [[ "${1:-}" == "run" && "${2:-}" == "build" ]]; then
  mkdir -p "$PWD/dist"
  echo 'console.log("hermes-fly test build")' > "$PWD/dist/cli.js"
  echo 'console.log("installer test build")' > "$PWD/dist/install-cli.js"
  exit 0
fi
if [[ "${1:-}" == "prune" && "${2:-}" == "--omit=dev" ]]; then
  exit 0
fi
echo "unexpected npm invocation: $*" >&2
exit 1
MOCK
  chmod +x "$mock_dir/npm"
}

write_noisy_mock_npm() {
  local mock_dir="$1"

  cat > "$mock_dir/npm" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "${MOCK_NPM_ARGS_FILE}"
if [[ "${1:-}" == "ci" ]]; then
  echo "added 110 packages in 902ms"
  mkdir -p "$PWD/node_modules/commander"
  echo '{"name":"commander"}' > "$PWD/node_modules/commander/package.json"
  exit 0
fi
if [[ "${1:-}" == "run" && "${2:-}" == "build" ]]; then
  echo ""
  echo "> build"
  echo "> tsc -p tsconfig.json"
  echo ""
  mkdir -p "$PWD/dist"
  echo 'console.log("hermes-fly test build")' > "$PWD/dist/cli.js"
  echo 'console.log("installer test build")' > "$PWD/dist/install-cli.js"
  exit 0
fi
if [[ "${1:-}" == "prune" && "${2:-}" == "--omit=dev" ]]; then
  echo ""
  echo "up to date in 319ms"
  exit 0
fi
echo "unexpected npm invocation: $*" >&2
exit 1
MOCK
  chmod +x "$mock_dir/npm"
}

write_mock_node() {
  local mock_dir="$1"
  local version="$2"

  cat > "$mock_dir/node" <<MOCK
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "\${MOCK_NODE_ARGS_FILE}"
if [[ "\${1:-}" == *"/dist/install-cli.js" && "\${2:-}" == "install" ]]; then
  if [[ -n "\${MOCK_INSTALLER_FAILURE_MESSAGE:-}" ]]; then
    echo "\${MOCK_INSTALLER_FAILURE_MESSAGE}" >&2
    exit 1
  fi
  if [[ "\${HERMES_FLY_INSTALLER_SKIP_BANNER:-0}" != "1" ]]; then
    cat <<'OUT'
  🪽 Hermes Fly Installer
  I can't fix Fly.io billing, but I can fix the part between curl and deploy.

OUT
  fi
  cat <<'OUT'
✓ Detected: darwin/arm64

Install plan
[1/3] Preparing environment
[2/3] Installing Hermes Fly
[3/3] Finalizing setup
🪽 Hermes Fly installed successfully (hermes-fly ${version})!
OUT
  exit 0
fi
if [[ "\$*" == *"--version"* ]]; then
  echo "hermes-fly ${version}"
  exit 0
fi
echo "unexpected node invocation: \$*" >&2
exit 1
MOCK
  chmod +x "$mock_dir/node"
}

write_mock_legacy_banner_node() {
  local mock_dir="$1"
  local version="$2"

  cat > "$mock_dir/node" <<MOCK
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "\${MOCK_NODE_ARGS_FILE}"
if [[ "\${1:-}" == *"/dist/install-cli.js" && "\${2:-}" == "install" ]]; then
  if [[ -n "\${MOCK_INSTALLER_FAILURE_MESSAGE:-}" ]]; then
    echo "\${MOCK_INSTALLER_FAILURE_MESSAGE}" >&2
    exit 1
  fi
  cat <<'OUT'
  🪽 Hermes Fly Installer
  I can't fix Fly.io billing, but I can fix the part between curl and deploy.

OUT
  cat <<'OUT'
✓ Detected: darwin/arm64

Install plan
[1/3] Preparing environment
[2/3] Installing Hermes Fly
[3/3] Finalizing setup
🪽 Hermes Fly installed successfully (hermes-fly ${version})!
OUT
  exit 0
fi
if [[ "\$*" == *"--version"* ]]; then
  echo "hermes-fly ${version}"
  exit 0
fi
echo "unexpected node invocation: \$*" >&2
exit 1
MOCK
  chmod +x "$mock_dir/node"
}

write_mock_release_tar() {
  local mock_dir="$1"

  cat > "$mock_dir/tar" <<'MOCK'
#!/usr/bin/env bash
if [[ "${1:-}" == "--help" ]]; then
  printf '%s\n' '--format {ustar|pax|cpio|shar}'
  printf '%s\n' '--no-mac-metadata'
  printf '%s\n' '--no-xattrs'
  printf '%s\n' '--no-acls'
  exit 0
fi

{
  printf 'COPYFILE_DISABLE=%s\n' "${COPYFILE_DISABLE:-}"
  printf 'COPY_EXTENDED_ATTRIBUTES_DISABLE=%s\n' "${COPY_EXTENDED_ATTRIBUTES_DISABLE:-}"
  printf 'ARGS=%s\n' "$*"
} > "${MOCK_TAR_ARGS_FILE}"

archive_path=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -czf)
      archive_path="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

: > "$archive_path"
MOCK
  chmod +x "$mock_dir/tar"
}

# --- detect_platform ---

@test "detect_platform returns darwin or linux" {
  run detect_platform
  assert_success
  [[ "$output" == "darwin" ]] || [[ "$output" == "linux" ]]
}

# --- detect_arch ---

@test "detect_arch returns amd64 or arm64" {
  run detect_arch
  assert_success
  [[ "$output" == "amd64" ]] || [[ "$output" == "arm64" ]]
}

@test "installer_no_color_requested treats empty NO_COLOR as an opt-out" {
  run bash -c '
    export NO_COLOR=""
    source "'"${PROJECT_ROOT}"'/scripts/install.sh"
    installer_no_color_requested
  '
  assert_success
}

# --- verify_checksum ---

@test "verify_checksum returns 0 on match" {
  local test_file="${TEST_TEMP_DIR}/checksum_test"
  echo "hello world" > "$test_file"
  local expected
  if command -v sha256sum >/dev/null 2>&1; then
    expected="$(sha256sum "$test_file" | cut -d' ' -f1)"
  else
    expected="$(shasum -a 256 "$test_file" | cut -d' ' -f1)"
  fi
  run verify_checksum "$test_file" "$expected"
  assert_success
}

@test "verify_checksum returns 1 on mismatch" {
  local test_file="${TEST_TEMP_DIR}/checksum_test"
  echo "hello world" > "$test_file"
  run verify_checksum "$test_file" "0000000000000000000000000000000000000000000000000000000000000000"
  assert_failure
}

# --- install_files ---

@test "install_files copies project files and creates symlink" {
  # Create a fake project layout
  local src="${TEST_TEMP_DIR}/src"
  mkdir -p "$src/templates" "$src/data"
  echo '#!/bin/sh' > "$src/hermes-fly"
  echo 'template' > "$src/templates/Dockerfile.template"
  echo '{"schema_version":"1"}' > "$src/data/reasoning-snapshot.json"

  local dest="${TEST_TEMP_DIR}/hermes-home"
  local bin="${TEST_TEMP_DIR}/bin"
  run install_files "$src" "$dest" "$bin"
  assert_success
  assert [ -f "${dest}/hermes-fly" ]
  assert [ -x "${dest}/hermes-fly" ]
  assert [ -f "${dest}/templates/Dockerfile.template" ]
  assert [ -f "${dest}/data/reasoning-snapshot.json" ]
  assert [ -L "${bin}/hermes-fly" ]
}

@test "install_files copies dist/ for TS runtime" {
  # Create a fake project layout with dist/
  local src="${TEST_TEMP_DIR}/src"
  mkdir -p "$src/dist" "$src/templates" "$src/node_modules/commander"
  echo '#!/usr/bin/env bash' > "$src/hermes-fly"
  chmod +x "$src/hermes-fly"
  echo '// compiled cli' > "$src/dist/cli.js"
  echo '{"name":"commander"}' > "$src/node_modules/commander/package.json"
  echo '{"type":"module"}' > "$src/package.json"
  echo '{"lockfileVersion":3}' > "$src/package-lock.json"

  local dest="${TEST_TEMP_DIR}/hermes-home"
  local bin="${TEST_TEMP_DIR}/bin"
  run install_files "$src" "$dest" "$bin"
  assert_success
  assert [ -f "${dest}/dist/cli.js" ]
  assert [ -f "${dest}/node_modules/commander/package.json" ]
  assert [ -f "${dest}/package.json" ]
  assert [ -f "${dest}/package-lock.json" ]
}

@test "prepare_runtime_artifacts builds dist and runtime dependencies when missing" {
  local src="${TEST_TEMP_DIR}/src"
  local mock_dir="${TEST_TEMP_DIR}/mock_bin"
  local npm_args_file="${TEST_TEMP_DIR}/npm_args"
  local npm_env_file="${TEST_TEMP_DIR}/npm_env"
  local bash_env_file="${TEST_TEMP_DIR}/noop_bash_env"

  mkdir -p "$mock_dir"
  write_source_checkout "$src"
  write_mock_npm "$mock_dir"
  : > "$bash_env_file"

  run bash -c '
    export PATH="'"$mock_dir"':${PATH}"
    export MOCK_NPM_ARGS_FILE="'"$npm_args_file"'"
    export MOCK_NPM_ENV_FILE="'"$npm_env_file"'"
    export BASH_ENV="'"$bash_env_file"'"
    export ENV="'"$bash_env_file"'"
    export LANG="broken-locale"
    export LC_ALL="broken-locale"
    source "'"${PROJECT_ROOT}"'/scripts/install.sh"
    prepare_runtime_artifacts "'"$src"'"
  '
  assert_success
  assert_output --partial "Preparing hermes-fly runtime dependencies"
  assert [ -f "${src}/dist/cli.js" ]
  assert [ -f "${src}/node_modules/commander/package.json" ]

  run cat "$npm_args_file"
  assert_success
  assert_output --partial "ci"
  assert_output --partial "run build"
  assert_output --partial "prune --omit=dev"

  run cat "$npm_env_file"
  assert_success
  assert_output --partial "BASH_ENV="
  assert_output --partial "ENV="
  assert_output --partial "LANG=C"
  assert_output --partial "LC_ALL=C"
}

@test "verify_installed_version surfaces launcher failure output" {
  local broken="${TEST_TEMP_DIR}/broken-hermes-fly"
  cat > "$broken" <<'MOCK'
#!/usr/bin/env bash
echo "Error: Cannot find module '/usr/local/lib/hermes-fly/dist/cli.js'" >&2
exit 1
MOCK
  chmod +x "$broken"

  run verify_installed_version "$broken" "v0.1.12"
  assert_failure
  assert_output --partial "Could not determine installed hermes-fly version"
  assert_output --partial "Cannot find module '/usr/local/lib/hermes-fly/dist/cli.js'"
}

@test "installed launcher ignores BASH_ENV and executes via a POSIX shell" {
  local src="${TEST_TEMP_DIR}/src"
  local dest="${TEST_TEMP_DIR}/hermes-home"
  local bin="${TEST_TEMP_DIR}/bin"
  local mock_dir="${TEST_TEMP_DIR}/mock_bin"
  local node_args_file="${TEST_TEMP_DIR}/node_args"
  local bash_env_file="${TEST_TEMP_DIR}/bash_env"

  mkdir -p "$src/dist" "$src/templates" "$src/node_modules/commander" "$mock_dir"
  cp "${PROJECT_ROOT}/hermes-fly" "$src/hermes-fly"
  chmod +x "$src/hermes-fly"
  echo '// compiled cli' > "$src/dist/cli.js"
  echo '{"name":"commander"}' > "$src/node_modules/commander/package.json"
  echo '{"type":"module"}' > "$src/package.json"
  echo '{"lockfileVersion":3}' > "$src/package-lock.json"
  echo 'tpl' > "$src/templates/Dockerfile.template"

  write_mock_node "$mock_dir" "9.9.9"
  printf 'echo BASH_ENV_LOADED >&2\n' > "$bash_env_file"

  run bash -c '
    export PATH="'"$mock_dir"':${PATH}"
    export MOCK_NODE_ARGS_FILE="'"$node_args_file"'"
    source "'"${PROJECT_ROOT}"'/scripts/install.sh"
    install_files "'"$src"'" "'"$dest"'" "'"$bin"'"
    BASH_ENV="'"$bash_env_file"'" "'"$bin"'/hermes-fly" --version 2>&1
  '
  assert_success
  assert_output --partial "hermes-fly 9.9.9"
  refute_output --partial "BASH_ENV_LOADED"
}

@test "package_release_asset creates a portable tarball without macOS metadata" {
  local src="${TEST_TEMP_DIR}/release_src"
  local out="${TEST_TEMP_DIR}/out"
  local mock_dir="${TEST_TEMP_DIR}/mock_bin"
  local npm_args_file="${TEST_TEMP_DIR}/npm_args"
  local tar_args_file="${TEST_TEMP_DIR}/tar_args"

  mkdir -p "$src/dist" "$src/templates" "$src/data" "$mock_dir"
  cat > "$src/hermes-fly" <<'MOCK'
#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec node "${SCRIPT_DIR}/dist/cli.js" "$@"
MOCK
  chmod +x "$src/hermes-fly"
  echo '// compiled cli' > "$src/dist/cli.js"
  echo '{"type":"module"}' > "$src/package.json"
  echo '{"lockfileVersion":3}' > "$src/package-lock.json"
  echo 'tpl' > "$src/templates/Dockerfile.template"
  echo '{}' > "$src/data/reasoning-snapshot.json"

  write_mock_npm "$mock_dir"
  write_mock_release_tar "$mock_dir"

  run bash -c '
    export PATH="'"$mock_dir"':${PATH}"
    export HERMES_FLY_PACKAGE_SOURCE_DIR="'"$src"'"
    export MOCK_NPM_ARGS_FILE="'"$npm_args_file"'"
    export MOCK_TAR_ARGS_FILE="'"$tar_args_file"'"
    bash "'"${PROJECT_ROOT}"'/scripts/package-release-asset.sh" v0.1.26 "'"$out"'"
  '
  assert_success
  assert_output --partial "${out}/hermes-fly-v0.1.26.tar.gz"
  assert [ -f "${out}/hermes-fly-v0.1.26.tar.gz" ]

  run cat "$npm_args_file"
  assert_success
  assert_output --partial "ci --omit=dev"

  run cat "$tar_args_file"
  assert_success
  assert_output --partial "COPYFILE_DISABLE=1"
  assert_output --partial "COPY_EXTENDED_ATTRIBUTES_DISABLE=1"
  [[ "$output" == *"--format ustar"* ]] || [[ "$output" == *"ARGS="* ]]
}

# --- release resolution ---

@test "resolve_install_channel defaults to latest" {
  run bash -c '
    unset HERMES_FLY_CHANNEL
    source "'"${PROJECT_ROOT}"'/scripts/install.sh"
    resolve_install_channel
  '
  assert_success
  assert_output "latest"
}

@test "resolve_install_channel accepts stable preview edge and latest" {
  run bash -c '
    export HERMES_FLY_CHANNEL="latest"
    source "'"${PROJECT_ROOT}"'/scripts/install.sh"
    resolve_install_channel
  '
  assert_success
  assert_output "latest"

  run bash -c '
    export HERMES_FLY_CHANNEL="stable"
    source "'"${PROJECT_ROOT}"'/scripts/install.sh"
    resolve_install_channel
  '
  assert_success
  assert_output "stable"

  run bash -c '
    export HERMES_FLY_CHANNEL="preview"
    source "'"${PROJECT_ROOT}"'/scripts/install.sh"
    resolve_install_channel
  '
  assert_success
  assert_output "preview"

  run bash -c '
    export HERMES_FLY_CHANNEL="edge"
    source "'"${PROJECT_ROOT}"'/scripts/install.sh"
    resolve_install_channel
  '
  assert_success
  assert_output "edge"
}

@test "resolve_install_channel unknown value falls back to latest with warning" {
  run bash -c '
    export HERMES_FLY_CHANNEL="nightly"
    source "'"${PROJECT_ROOT}"'/scripts/install.sh"
    resolve_install_channel 2>&1
  '
  assert_success
  assert_output --partial "latest"
  assert_output --partial "Warning"
}

@test "resolve_install_ref uses latest GitHub release for latest channel" {
  local mock_dir="${TEST_TEMP_DIR}/mock_bin"
  mkdir -p "$mock_dir"
  cat > "$mock_dir/curl" <<'MOCK'
#!/usr/bin/env bash
printf '{"tag_name":"v0.1.12"}\n'
MOCK
  chmod +x "$mock_dir/curl"

  run bash -c '
    unset HERMES_FLY_VERSION
    export PATH="'"$mock_dir"':${PATH}"
    source "'"${PROJECT_ROOT}"'/scripts/install.sh"
    resolve_install_ref latest
  '
  assert_success
  assert_output "v0.1.12"
}

@test "resolve_install_ref uses latest GitHub release for stable channel" {
  local mock_dir="${TEST_TEMP_DIR}/mock_bin"
  mkdir -p "$mock_dir"
  cat > "$mock_dir/curl" <<'MOCK'
#!/usr/bin/env bash
printf '{"tag_name":"v0.1.12"}\n'
MOCK
  chmod +x "$mock_dir/curl"

  run bash -c '
    export PATH="'"$mock_dir"':${PATH}"
    source "'"${PROJECT_ROOT}"'/scripts/install.sh"
    resolve_install_ref stable
  '
  assert_success
  assert_output "v0.1.12"
}

@test "resolve_install_ref returns main for edge channel by default" {
  run bash -c '
    unset HERMES_FLY_VERSION
    source "'"${PROJECT_ROOT}"'/scripts/install.sh"
    resolve_install_ref edge
  '
  assert_success
  assert_output "main"
}

@test "resolve_install_ref normalizes HERMES_FLY_VERSION override without v prefix" {
  run bash -c '
    export HERMES_FLY_VERSION="0.1.12"
    source "'"${PROJECT_ROOT}"'/scripts/install.sh"
    resolve_install_ref
  '
  assert_success
  assert_output "v0.1.12"
}

@test "resolve_install_ref explicit HERMES_FLY_VERSION override wins over edge channel" {
  run bash -c '
    export HERMES_FLY_VERSION="0.9.1"
    source "'"${PROJECT_ROOT}"'/scripts/install.sh"
    resolve_install_ref edge
  '
  assert_success
  assert_output "v0.9.1"
}

# --- main() install flow ---

@test "main bootstraps the Commander installer CLI without leaking npm build chatter" {
  local mock_dir="${TEST_TEMP_DIR}/mock_bin"
  mkdir -p "$mock_dir"
  local node_args_file="${TEST_TEMP_DIR}/node_args"
  local npm_args_file="${TEST_TEMP_DIR}/npm_args"
  : > "$npm_args_file"
  write_mock_node "$mock_dir" "0.1.12"
  write_noisy_mock_npm "$mock_dir"

  run bash -c '
    export MOCK_NODE_ARGS_FILE="'"$node_args_file"'"
    export MOCK_NPM_ARGS_FILE="'"$npm_args_file"'"
    export PATH="'"$mock_dir"':${PATH}"
    source "'"${PROJECT_ROOT}"'/scripts/install.sh"
    main
  '
  assert_success
  assert_output --partial "🪽 Hermes Fly Installer"
  assert_output --partial "[1/3] Preparing environment"
  assert_output --partial "Hermes Fly installed successfully (hermes-fly 0.1.12)!"
  refute_output --partial "added 110 packages"
  refute_output --partial "> build"
  refute_output --partial "up to date in 319ms"
  [[ "$(printf '%s' "$output" | grep -o "🪽 Hermes Fly Installer" | wc -l | tr -d ' ')" == "1" ]]

  run cat "$node_args_file"
  assert_success
  assert_output --partial "dist/install-cli.js install"

  run cat "$npm_args_file"
  assert_success
  assert_output --partial "ci --no-audit --no-fund"
  assert_output --partial "run build"
  assert_output --partial "prune --omit=dev --no-audit --no-fund"
}

@test "bootstrap_installer_cli downloads the checked installer release when not running from a local checkout" {
  local mock_dir="${TEST_TEMP_DIR}/mock_bin_bootstrap_ref"
  local script_dir="${TEST_TEMP_DIR}/standalone_script"
  local script_copy="${script_dir}/install.sh"
  local node_args_file="${TEST_TEMP_DIR}/node_args_bootstrap_ref"
  local npm_args_file="${TEST_TEMP_DIR}/npm_args_bootstrap_ref"
  local url_file="${TEST_TEMP_DIR}/bootstrap_urls"
  local archive_parent="${TEST_TEMP_DIR}/bootstrap_archive_parent"
  local archive_root="${archive_parent}/hermes-fly-bootstrap"
  local archive_file="${TEST_TEMP_DIR}/bootstrap_source.tar.gz"
  local bootstrap_ref

  mkdir -p "$mock_dir" "$script_dir" "$archive_root"
  cp "${PROJECT_ROOT}/scripts/install.sh" "$script_copy"
  chmod +x "$script_copy"
  write_source_checkout "$archive_root"
  bootstrap_ref="v$(sed -n 's/.*HERMES_FLY_TS_VERSION = \"\\([^\"]*\\)\".*/\\1/p' "${PROJECT_ROOT}/src/version.ts" | head -1)"
  tar -czf "$archive_file" -C "$archive_parent" "$(basename "$archive_root")"

  cat > "$mock_dir/curl" <<'MOCK'
#!/usr/bin/env bash
out=""
url=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -o)
      out="$2"
      shift 2
      ;;
    *)
      url="$1"
      shift
      ;;
  esac
done
printf '%s\n' "$url" >> "${MOCK_CURL_URL_FILE}"
if [[ "$url" == "https://codeload.github.com/alexfazio/hermes-fly/tar.gz/"* ]]; then
  cat "${MOCK_BOOTSTRAP_ARCHIVE_FILE}" > "$out"
  exit 0
fi
echo "unexpected curl url: $url" >&2
exit 1
MOCK
  chmod +x "$mock_dir/curl"
  write_mock_node "$mock_dir" "0.1.12"
  write_mock_npm "$mock_dir"

  run bash -c '
    export PATH="'"$mock_dir"':${PATH}"
    export MOCK_NODE_ARGS_FILE="'"$node_args_file"'"
    export MOCK_NPM_ARGS_FILE="'"$npm_args_file"'"
    export MOCK_CURL_URL_FILE="'"$url_file"'"
    export MOCK_BOOTSTRAP_REF="'"$bootstrap_ref"'"
    export MOCK_BOOTSTRAP_ARCHIVE_FILE="'"$archive_file"'"
    source "'"$script_copy"'"
    bootstrap_installer_cli
  '
  assert_success

  run cat "$url_file"
  assert_success
  assert_output --partial "https://codeload.github.com/alexfazio/hermes-fly/tar.gz/${bootstrap_ref}"
  refute_output --partial "/main"
}

@test "main avoids a duplicate banner when the downloaded bootstrap installer still prints its own banner" {
  local mock_dir="${TEST_TEMP_DIR}/mock_bin_standalone_banner"
  local script_dir="${TEST_TEMP_DIR}/standalone_script_banner"
  local script_copy="${script_dir}/install.sh"
  local node_args_file="${TEST_TEMP_DIR}/node_args_standalone_banner"
  local npm_args_file="${TEST_TEMP_DIR}/npm_args_standalone_banner"
  local url_file="${TEST_TEMP_DIR}/bootstrap_urls_standalone_banner"
  local archive_parent="${TEST_TEMP_DIR}/bootstrap_archive_parent_banner"
  local archive_root="${archive_parent}/hermes-fly-bootstrap"
  local archive_file="${TEST_TEMP_DIR}/bootstrap_source_banner.tar.gz"
  local bootstrap_ref

  mkdir -p "$mock_dir" "$script_dir" "$archive_root"
  cp "${PROJECT_ROOT}/scripts/install.sh" "$script_copy"
  chmod +x "$script_copy"
  write_source_checkout "$archive_root"
  bootstrap_ref="v$(sed -n 's/.*HERMES_FLY_TS_VERSION = \"\\([^\"]*\\)\".*/\\1/p' "${PROJECT_ROOT}/src/version.ts" | head -1)"
  tar -czf "$archive_file" -C "$archive_parent" "$(basename "$archive_root")"

  cat > "$mock_dir/curl" <<'MOCK'
#!/usr/bin/env bash
out=""
url=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -o)
      out="$2"
      shift 2
      ;;
    *)
      url="$1"
      shift
      ;;
  esac
done
printf '%s\n' "$url" >> "${MOCK_CURL_URL_FILE}"
if [[ "$url" == "https://codeload.github.com/alexfazio/hermes-fly/tar.gz/"* ]]; then
  cat "${MOCK_BOOTSTRAP_ARCHIVE_FILE}" > "$out"
  exit 0
fi
echo "unexpected curl url: $url" >&2
exit 1
MOCK
  chmod +x "$mock_dir/curl"
  write_mock_legacy_banner_node "$mock_dir" "0.1.12"
  write_mock_npm "$mock_dir"

  run bash -c '
    export PATH="'"$mock_dir"':${PATH}"
    export MOCK_NODE_ARGS_FILE="'"$node_args_file"'"
    export MOCK_NPM_ARGS_FILE="'"$npm_args_file"'"
    export MOCK_CURL_URL_FILE="'"$url_file"'"
    export MOCK_BOOTSTRAP_REF="'"$bootstrap_ref"'"
    export MOCK_BOOTSTRAP_ARCHIVE_FILE="'"$archive_file"'"
    source "'"$script_copy"'"
    main
  '
  assert_success
  assert_output --partial "🪽 Hermes Fly Installer"
  [[ "$(printf '%s' "$output" | grep -o "🪽 Hermes Fly Installer" | wc -l | tr -d ' ')" == "1" ]]
}

@test "main falls back to the legacy installer flow when Commander bootstrap fails" {
  local mock_dir="${TEST_TEMP_DIR}/mock_bin"
  mkdir -p "$mock_dir"
  local node_args_file="${TEST_TEMP_DIR}/node_args_fallback"
  local npm_args_file="${TEST_TEMP_DIR}/npm_args_fallback"
  local asset_root="${TEST_TEMP_DIR}/asset_root"
  local asset_file="${TEST_TEMP_DIR}/hermes-fly-v0.1.12.tar.gz"
  : > "$npm_args_file"

  mkdir -p "$asset_root/dist" "$asset_root/node_modules/commander" "$asset_root/templates" "$asset_root/data"
  cat > "$asset_root/hermes-fly" <<'MOCK'
#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec node "${SCRIPT_DIR}/dist/cli.js" "$@"
MOCK
  chmod +x "$asset_root/hermes-fly"
  echo '// packaged cli' > "$asset_root/dist/cli.js"
  echo '{"name":"commander"}' > "$asset_root/node_modules/commander/package.json"
  echo '{"type":"module"}' > "$asset_root/package.json"
  echo '{"lockfileVersion":3}' > "$asset_root/package-lock.json"
  echo 'tpl' > "$asset_root/templates/Dockerfile.template"
  echo '{}' > "$asset_root/data/reasoning-snapshot.json"
  tar -czf "$asset_file" -C "$asset_root" .

  cat > "$mock_dir/curl" <<'MOCK'
#!/usr/bin/env bash
out=""
url=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -o)
      out="$2"
      shift 2
      ;;
    *)
      url="$1"
      shift
      ;;
  esac
done
if [[ "$url" == *"/releases/latest" ]]; then
  printf '{"tag_name":"v0.1.12"}\n'
  exit 0
fi
if [[ "$url" == *"/releases/tags/v0.1.12" ]]; then
  printf '{"browser_download_url":"https://example.invalid/hermes-fly-v0.1.12.tar.gz"}\n'
  exit 0
fi
if [[ "$url" == "https://example.invalid/hermes-fly-v0.1.12.tar.gz" ]]; then
  cat "${MOCK_RELEASE_ASSET_FILE}" > "$out"
  exit 0
fi
exit 1
MOCK
  chmod +x "$mock_dir/curl"
  write_mock_node "$mock_dir" "0.1.12"
  write_mock_npm "$mock_dir"

  local install_home="${TEST_TEMP_DIR}/hermes_home"
  local install_bin="${TEST_TEMP_DIR}/install_bin"
  run bash -c '
    export HERMES_FLY_CHANNEL="latest"
    export HERMES_FLY_HOME="'"$install_home"'"
    export HERMES_FLY_INSTALL_DIR="'"$install_bin"'"
    export MOCK_NODE_ARGS_FILE="'"$node_args_file"'"
    export MOCK_NPM_ARGS_FILE="'"$npm_args_file"'"
    export MOCK_RELEASE_ASSET_FILE="'"$asset_file"'"
    export MOCK_INSTALLER_FAILURE_MESSAGE="Installer error: bootstrap failure"
    export PATH="'"$mock_dir"':${PATH}"
    source "'"${PROJECT_ROOT}"'/scripts/install.sh"
    main
  '
  assert_success
  assert_output --partial "Installing hermes-fly..."
  assert_output --partial "Downloading hermes-fly release asset"
  assert_output --partial "hermes-fly installed successfully!"
}

@test "legacy fallback preserves installer arguments when Commander bootstrap fails" {
  local mock_dir="${TEST_TEMP_DIR}/mock_bin_args"
  mkdir -p "$mock_dir"
  local node_args_file="${TEST_TEMP_DIR}/node_args_fallback_args"
  local npm_args_file="${TEST_TEMP_DIR}/npm_args_fallback_args"
  local asset_root="${TEST_TEMP_DIR}/asset_root_args"
  local asset_file="${TEST_TEMP_DIR}/hermes-fly-v0.1.12-args.tar.gz"
  : > "$npm_args_file"

  mkdir -p "$asset_root/dist" "$asset_root/node_modules/commander" "$asset_root/templates" "$asset_root/data"
  cat > "$asset_root/hermes-fly" <<'MOCK'
#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec node "${SCRIPT_DIR}/dist/cli.js" "$@"
MOCK
  chmod +x "$asset_root/hermes-fly"
  echo '// packaged cli' > "$asset_root/dist/cli.js"
  echo '{"name":"commander"}' > "$asset_root/node_modules/commander/package.json"
  echo '{"type":"module"}' > "$asset_root/package.json"
  echo '{"lockfileVersion":3}' > "$asset_root/package-lock.json"
  echo 'tpl' > "$asset_root/templates/Dockerfile.template"
  echo '{}' > "$asset_root/data/reasoning-snapshot.json"
  tar -czf "$asset_file" -C "$asset_root" .

  cat > "$mock_dir/curl" <<'MOCK'
#!/usr/bin/env bash
out=""
url=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -o)
      out="$2"
      shift 2
      ;;
    *)
      url="$1"
      shift
      ;;
  esac
done
if [[ "$url" == *"/releases/latest" ]]; then
  printf '{"tag_name":"v0.1.12"}\n'
  exit 0
fi
if [[ "$url" == *"/releases/tags/v0.1.12" ]]; then
  printf '{"browser_download_url":"https://example.invalid/hermes-fly-v0.1.12.tar.gz"}\n'
  exit 0
fi
if [[ "$url" == "https://example.invalid/hermes-fly-v0.1.12.tar.gz" ]]; then
  cat "${MOCK_RELEASE_ASSET_FILE}" > "$out"
  exit 0
fi
exit 1
MOCK
  chmod +x "$mock_dir/curl"
  write_mock_node "$mock_dir" "0.1.12"
  write_mock_npm "$mock_dir"

  local install_home="${TEST_TEMP_DIR}/custom_hermes_home"
  local install_bin="${TEST_TEMP_DIR}/custom_install_bin"
  run bash -c '
    export HERMES_FLY_HOME="'"${TEST_TEMP_DIR}"'/ignored_home"
    export HERMES_FLY_INSTALL_DIR="'"${TEST_TEMP_DIR}"'/ignored_bin"
    export MOCK_NODE_ARGS_FILE="'"$node_args_file"'"
    export MOCK_NPM_ARGS_FILE="'"$npm_args_file"'"
    export MOCK_RELEASE_ASSET_FILE="'"$asset_file"'"
    export MOCK_INSTALLER_FAILURE_MESSAGE="Installer error: bootstrap failure"
    export PATH="'"$mock_dir"':${PATH}"
    source "'"${PROJECT_ROOT}"'/scripts/install.sh"
    main --channel edge --version 0.1.12 --install-home "'"$install_home"'" --bin-dir "'"$install_bin"'"
  '
  assert_success
  assert_output --partial "Channel: edge"
  assert_output --partial "Install to: ${install_home}"
  assert_output --partial "Symlink in: ${install_bin}"
  assert_output --partial "Release: v0.1.12"
  assert [ -f "${install_home}/hermes-fly" ]
  assert [ -L "${install_bin}/hermes-fly" ]
}

@test "legacy fallback accepts supported installer arguments in --option=value form" {
  local mock_dir="${TEST_TEMP_DIR}/mock_bin_equals"
  mkdir -p "$mock_dir"
  local node_args_file="${TEST_TEMP_DIR}/node_args_fallback_equals"
  local npm_args_file="${TEST_TEMP_DIR}/npm_args_fallback_equals"
  local asset_root="${TEST_TEMP_DIR}/asset_root_equals"
  local asset_file="${TEST_TEMP_DIR}/hermes-fly-v0.1.12-equals.tar.gz"
  : > "$npm_args_file"

  mkdir -p "$asset_root/dist" "$asset_root/node_modules/commander" "$asset_root/templates" "$asset_root/data"
  cat > "$asset_root/hermes-fly" <<'MOCK'
#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec node "${SCRIPT_DIR}/dist/cli.js" "$@"
MOCK
  chmod +x "$asset_root/hermes-fly"
  echo '// packaged cli' > "$asset_root/dist/cli.js"
  echo '{"name":"commander"}' > "$asset_root/node_modules/commander/package.json"
  echo '{"type":"module"}' > "$asset_root/package.json"
  echo '{"lockfileVersion":3}' > "$asset_root/package-lock.json"
  echo 'tpl' > "$asset_root/templates/Dockerfile.template"
  echo '{}' > "$asset_root/data/reasoning-snapshot.json"
  tar -czf "$asset_file" -C "$asset_root" .

  cat > "$mock_dir/curl" <<'MOCK'
#!/usr/bin/env bash
out=""
url=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -o)
      out="$2"
      shift 2
      ;;
    *)
      url="$1"
      shift
      ;;
  esac
done
if [[ "$url" == *"/releases/latest" ]]; then
  printf '{"tag_name":"v0.1.12"}\n'
  exit 0
fi
if [[ "$url" == *"/releases/tags/v0.1.12" ]]; then
  printf '{"browser_download_url":"https://example.invalid/hermes-fly-v0.1.12.tar.gz"}\n'
  exit 0
fi
if [[ "$url" == "https://example.invalid/hermes-fly-v0.1.12.tar.gz" ]]; then
  cat "${MOCK_RELEASE_ASSET_FILE}" > "$out"
  exit 0
fi
exit 1
MOCK
  chmod +x "$mock_dir/curl"
  write_mock_node "$mock_dir" "0.1.12"
  write_mock_npm "$mock_dir"

  local install_home="${TEST_TEMP_DIR}/equals_hermes_home"
  local install_bin="${TEST_TEMP_DIR}/equals_install_bin"
  run bash -c '
    export HERMES_FLY_HOME="'"${TEST_TEMP_DIR}"'/ignored_equals_home"
    export HERMES_FLY_INSTALL_DIR="'"${TEST_TEMP_DIR}"'/ignored_equals_bin"
    export MOCK_NODE_ARGS_FILE="'"$node_args_file"'"
    export MOCK_NPM_ARGS_FILE="'"$npm_args_file"'"
    export MOCK_RELEASE_ASSET_FILE="'"$asset_file"'"
    export MOCK_INSTALLER_FAILURE_MESSAGE="Installer error: bootstrap failure"
    export PATH="'"$mock_dir"':${PATH}"
    source "'"${PROJECT_ROOT}"'/scripts/install.sh"
    main --channel=edge --version=0.1.12 --install-home="'"$install_home"'" --bin-dir="'"$install_bin"'"
  '
  assert_success
  assert_output --partial "Channel: edge"
  assert_output --partial "Install to: ${install_home}"
  assert_output --partial "Symlink in: ${install_bin}"
  assert_output --partial "Release: v0.1.12"
  assert [ -f "${install_home}/hermes-fly" ]
  assert [ -L "${install_bin}/hermes-fly" ]
}

@test "legacy fallback fails fast on unsupported installer options" {
  local mock_dir="${TEST_TEMP_DIR}/mock_bin_bad_flag"
  mkdir -p "$mock_dir"
  local node_args_file="${TEST_TEMP_DIR}/node_args_bad_flag"
  local npm_args_file="${TEST_TEMP_DIR}/npm_args_bad_flag"
  : > "$npm_args_file"

  write_mock_node "$mock_dir" "0.1.12"
  write_mock_npm "$mock_dir"

  local install_home="${TEST_TEMP_DIR}/bad_flag_home"
  local install_bin="${TEST_TEMP_DIR}/bad_flag_bin"
  run bash -c '
    export HERMES_FLY_HOME="'"$install_home"'"
    export HERMES_FLY_INSTALL_DIR="'"$install_bin"'"
    export MOCK_NODE_ARGS_FILE="'"$node_args_file"'"
    export MOCK_NPM_ARGS_FILE="'"$npm_args_file"'"
    export MOCK_INSTALLER_FAILURE_MESSAGE="Installer error: unknown option --bogus"
    export PATH="'"$mock_dir"':${PATH}"
    source "'"${PROJECT_ROOT}"'/scripts/install.sh"
    main --bogus
  '
  assert_failure
  assert_output --partial "Installer error: unknown option --bogus"
  assert_output --partial "Unsupported installer option for legacy fallback: --bogus"
  refute_output --partial "Installing hermes-fly..."
  assert [ ! -e "${install_home}/hermes-fly" ]
  assert [ ! -e "${install_bin}/hermes-fly" ]
}

@test "legacy fallback still surfaces version mismatch when installed version differs" {
  local mock_dir="${TEST_TEMP_DIR}/mock_bin"
  mkdir -p "$mock_dir"
  local node_args_file="${TEST_TEMP_DIR}/node_args_mismatch"
  local npm_args_file="${TEST_TEMP_DIR}/npm_args_mismatch"
  local asset_root="${TEST_TEMP_DIR}/asset_root_mismatch"
  local asset_file="${TEST_TEMP_DIR}/hermes-fly-v0.1.12-mismatch.tar.gz"
  : > "$npm_args_file"

  mkdir -p "$asset_root/dist" "$asset_root/node_modules/commander" "$asset_root/templates" "$asset_root/data"
  cat > "$asset_root/hermes-fly" <<'MOCK'
#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec node "${SCRIPT_DIR}/dist/cli.js" "$@"
MOCK
  chmod +x "$asset_root/hermes-fly"
  echo '// packaged cli' > "$asset_root/dist/cli.js"
  echo '{"name":"commander"}' > "$asset_root/node_modules/commander/package.json"
  echo '{"type":"module"}' > "$asset_root/package.json"
  echo '{"lockfileVersion":3}' > "$asset_root/package-lock.json"
  echo 'tpl' > "$asset_root/templates/Dockerfile.template"
  echo '{}' > "$asset_root/data/reasoning-snapshot.json"
  tar -czf "$asset_file" -C "$asset_root" .

  cat > "$mock_dir/curl" <<'MOCK'
#!/usr/bin/env bash
out=""
url=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -o)
      out="$2"
      shift 2
      ;;
    *)
      url="$1"
      shift
      ;;
  esac
done
if [[ "$url" == *"/releases/latest" ]]; then
  printf '{"tag_name":"v0.1.12"}\n'
  exit 0
fi
if [[ "$url" == *"/releases/tags/v0.1.12" ]]; then
  printf '{"browser_download_url":"https://example.invalid/hermes-fly-v0.1.12.tar.gz"}\n'
  exit 0
fi
if [[ "$url" == "https://example.invalid/hermes-fly-v0.1.12.tar.gz" ]]; then
  cat "${MOCK_RELEASE_ASSET_FILE}" > "$out"
  exit 0
fi
exit 1
MOCK
  chmod +x "$mock_dir/curl"

  write_mock_node "$mock_dir" "0.1.11"
  write_mock_npm "$mock_dir"

  local install_home="${TEST_TEMP_DIR}/hermes_home_mismatch"
  local install_bin="${TEST_TEMP_DIR}/install_bin_mismatch"
  run bash -c '
    export HERMES_FLY_CHANNEL="stable"
    export HERMES_FLY_HOME="'"$install_home"'"
    export HERMES_FLY_INSTALL_DIR="'"$install_bin"'"
    export MOCK_NODE_ARGS_FILE="'"$node_args_file"'"
    export MOCK_NPM_ARGS_FILE="'"$npm_args_file"'"
    export MOCK_RELEASE_ASSET_FILE="'"$asset_file"'"
    export MOCK_INSTALLER_FAILURE_MESSAGE="Installer error: bootstrap failure"
    export PATH="'"$mock_dir"':${PATH}"
    source "'"${PROJECT_ROOT}"'/scripts/install.sh"
    main
  '
  assert_failure
  assert_output --partial "Installed version mismatch"
}
