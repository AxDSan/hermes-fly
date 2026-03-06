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

# --- install_binary ---

@test "install_binary copies to destination" {
  local src="${TEST_TEMP_DIR}/fake-binary"
  echo '#!/bin/sh' > "$src"
  local dest="${TEST_TEMP_DIR}/install_dest"
  run install_binary "$src" "$dest"
  assert_success
  assert [ -f "${dest}/hermes-fly" ]
  assert [ -x "${dest}/hermes-fly" ]
}

# --- main() with checksum ---

@test "install main downloads and verifies checksum" {
  # Create a fake binary and matching .sha256 file for the mock curl to serve
  local fake_binary_content="fake-hermes-fly-binary-content"
  local expected_hash
  if command -v sha256sum >/dev/null 2>&1; then
    expected_hash="$(printf '%s' "$fake_binary_content" | sha256sum | cut -d' ' -f1)"
  else
    expected_hash="$(printf '%s' "$fake_binary_content" | shasum -a 256 | cut -d' ' -f1)"
  fi

  # Create a mock curl that writes the binary or checksum depending on URL
  local mock_dir="${TEST_TEMP_DIR}/mock_bin"
  mkdir -p "$mock_dir"
  cat > "$mock_dir/curl" <<MOCK
#!/usr/bin/env bash
output_file=""
url=""
for arg in "\$@"; do
  if [[ "\${prev:-}" == "-o" ]]; then
    output_file="\$arg"
  fi
  prev="\$arg"
  if [[ "\$arg" == http* ]]; then
    url="\$arg"
  fi
done
if [[ "\$url" == *.sha256 ]]; then
  printf '%s  hermes-fly\n' "$expected_hash" > "\$output_file"
else
  printf '%s' "$fake_binary_content" > "\$output_file"
fi
exit 0
MOCK
  chmod +x "$mock_dir/curl"

  local install_dest="${TEST_TEMP_DIR}/install_dest"
  run bash -c '
    export HERMES_FLY_INSTALL_DIR="'"$install_dest"'"
    export PATH="'"$mock_dir"':${PATH}"
    source "'"${PROJECT_ROOT}"'/scripts/install.sh"
    main
  '
  assert_success
  assert_output --partial "hermes-fly installed successfully"
  assert [ -f "${install_dest}/hermes-fly" ]
}

@test "install main aborts on checksum mismatch" {
  # Create a mock curl that serves a binary but a wrong checksum
  local mock_dir="${TEST_TEMP_DIR}/mock_bin"
  mkdir -p "$mock_dir"
  cat > "$mock_dir/curl" <<'MOCK'
#!/usr/bin/env bash
output_file=""
url=""
for arg in "$@"; do
  if [[ "${prev:-}" == "-o" ]]; then
    output_file="$arg"
  fi
  prev="$arg"
  if [[ "$arg" == http* ]]; then
    url="$arg"
  fi
done
if [[ "$url" == *.sha256 ]]; then
  printf '0000000000000000000000000000000000000000000000000000000000000000  hermes-fly\n' > "$output_file"
else
  printf 'some-binary-content' > "$output_file"
fi
exit 0
MOCK
  chmod +x "$mock_dir/curl"

  local install_dest="${TEST_TEMP_DIR}/install_dest"
  run bash -c '
    export HERMES_FLY_INSTALL_DIR="'"$install_dest"'"
    export PATH="'"$mock_dir"':${PATH}"
    source "'"${PROJECT_ROOT}"'/scripts/install.sh"
    main
  '
  assert_failure
  assert_output --partial "Checksum verification failed"
}
