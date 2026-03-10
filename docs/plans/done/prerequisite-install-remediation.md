# Prerequisite Installation Remediation Plan

**Status**: Planning
**Created**: 2026-03-08
**Scope**: Fix broken prerequisite auto-installation workflow on Linux (and macOS)
**Priority**: High (critical UX blocker for new users)

---

## 1. Problem Statement

### Current Behavior (Broken)

On Linux (and to some extent macOS), the prerequisite auto-installation feature experiences cascading failures:

1. **Repeated Installation Attempts**: Running `hermes-fly deploy` twice attempts to install `flyctl` both times, even though it was successfully installed the first time
   - Evidence: User logs show identical "Installing fly..." → "✓ flyctl installed" → "✗ Not authenticated" on both runs
   - Impact: User confusion; suggests installation failed or isn't being detected

2. **PATH Not Available in Current Session**: After `flyctl` installation, the tool is unavailable in the current shell
   - Evidence: Installer output says "✓ flyctl installed (added ~/.fly/bin to PATH)" but then `command not found: flyctl`
   - Evidence: Separate manual `curl -L https://fly.io/install.sh | sh` shows "flyctl PATH configured in ~/.zshrc" but then `flyctl: command not found`
   - Impact: Non-technical users forced to restart terminal or manually source shell config
   - Root cause: Fly.io installer adds to the shell config file (e.g. `~/.zshrc` or `~/.bashrc`) but doesn't reload it in the current session

3. **Confusing Error Messages**: Messages conflate installation state with authentication state
   - Example: "✓ flyctl installed (added ~/.fly/bin to PATH)" → "✗ Not authenticated"
   - This makes users think installation succeeded when it's actually still broken
   - Impact: Users don't understand what went wrong or what to do next

4. **Unintuitive User Workflow**: Non-technical users must understand:
   - Multiple terminal windows / sessions
   - Shell config files (~/.zshrc, ~/.bashrc)
   - PATH environment variable concepts
   - Manual `source` command
   - Impact: Major friction for deployment wizard target audience

### Expected Behavior (After Fix)

- First run: `hermes-fly deploy` detects missing prerequisites, installs them, makes them available immediately in the current session
- Second run: `hermes-fly deploy` skips installation (idempotent), proceeds directly to deployment
- Tools work immediately without terminal restart or manual reload
- Error messages clearly explain what's available, what's not, and what to do next
- Non-technical users can complete the full deploy workflow with minimal terminal knowledge

---

## 2. Root Cause Analysis

### Root Cause #1: PATH Not Available in Current Session

**Location**: `lib/prereqs.sh:178-179`

```bash
for tool in fly git curl; do
  command -v "$tool" >/dev/null 2>&1 && continue
```

**The Issue**:
- The Fly.io installer adds `~/.fly/bin` to the shell config file (e.g., `~/.zshrc`), but the current shell session doesn't reload the config
- `prereqs_check_and_install()` checks for the `fly` tool via `command -v`, which fails because `~/.fly/bin` is not in PATH for the current session
- Detection fails even though the binary exists on disk in `~/.fly/bin/flyctl` (with symlink `~/.fly/bin/fly`)
- Therefore, on subsequent runs, hermes-fly thinks flyctl is still missing and re-attempts installation

**Evidence**:
- Fly.io install script outputs: `flyctl was installed successfully to /home/sprite/.fly/bin/flyctl`
- The primary binary is `/home/sprite/.fly/bin/flyctl`, with a symlink at `/home/sprite/.fly/bin/fly`
- However, neither is discoverable via `command -v` unless `~/.fly/bin` is in PATH
- `lib/prereqs.sh` lines 149-152 handle flyctl specifically: `if [[ "$tool" == "fly" ]] && [[ -d "${HOME}/.fly/bin" ]]; then`
- The detection loop on line 179 checks `command -v fly`, which would work if `~/.fly/bin` were in PATH (the installer creates a `fly` symlink)

**Impact**:
- Installation runs repeatedly (not idempotent)
- User sees the same installation message twice, creating confusion about whether it actually worked

---

### Root Cause #2: Shell Config Reload Not Automatic

**Location**: `lib/prereqs.sh:149-152`

```bash
# flyctl: add ~/.fly/bin to PATH for current session
if [[ "$tool" == "fly" ]] && [[ -d "${HOME}/.fly/bin" ]]; then
  export PATH="${HOME}/.fly/bin:${PATH}"
  printf '  \033[32m✓\033[0m flyctl installed (added ~/.fly/bin to PATH)\n' >&2
```

**The Issue**:
- External installer (Fly.io's `curl -L https://fly.io/install.sh | sh`) adds to `~/.zshrc` / `~/.bashrc`
- `prereqs.sh` does export PATH for the current session: `export PATH="${HOME}/.fly/bin:${PATH}"`
- However, the external installer's PATH modification only takes effect when the shell is restarted or manually sourced
- The current shell has both modifications (prereqs.sh export + installer config file), but the installer's config-file approach is unreliable

**Evidence**:
- Fly.io installer output: `flyctl PATH configured successfully in /home/sprite/.zshrc`
- But `$PATH` in the running zsh session doesn't include `~/.fly/bin` automatically
- User must either: (a) exit and restart shell, (b) run `source ~/.zshrc`, or (c) wait for the export to take effect

**Compounding Issue**:
- When the user runs `hermes-fly deploy` from within a fresh shell session (after manually sourcing or restarting), the detection on line 179 (`command -v fly`) still fails because the tool is named `flyctl`, not `fly`
- So even if PATH is correct, detection fails due to the name mismatch

**Impact**:
- Tools installed by hermes-fly are unavailable in the current shell without manual intervention
- Breaks the promise: "✓ flyctl installed (added ~/.fly/bin to PATH)" — it's not actually in PATH yet
- Forces non-technical users into a second terminal session to complete auth setup

---

### Root Cause #3: Incomplete External Installer Integration

**Location**: `lib/prereqs.sh:113-156` (prereqs_install_tool function)

**The Issue**:
- Code runs external installer command: `eval "$cmd"` where cmd is something like `curl -L https://fly.io/install.sh | sh`
- If the command succeeds (exit code 0), we print "✓ installed"
- But "success" (exit code 0) doesn't mean the tool is actually available — it just means the script ran
- No verification that:
  - The binary was actually created
  - The binary is executable
  - The binary is in a discoverable location
  - The binary works (e.g., `flyctl version` succeeds)

**Evidence**:
- Fly.io installer can succeed even if PATH isn't set up correctly in the running shell
- Exit code 0 just means the installer script ran without error, not that the tool is usable

**Impact**:
- False success messages confuse users
- Downstream operations fail because the tool isn't actually available

---

### Root Cause #4: No Awareness of Current Shell Type

**Location**: `lib/prereqs.sh` (entire file)

**The Issue**:
- `prereqs.sh` is sourced by `hermes-fly` shell script
- But we don't detect or track which shell the user is running
- Different shells have different config files (`.zshrc` vs `.bashrc` vs `.fish/config.fish`)
- We can't intelligently source the right config file without knowing the current shell

**Evidence**:
- Fly.io installer detects the current shell and adds PATH to the appropriate config file (`~/.zshrc` for zsh, `~/.bashrc` or `~/.bash_profile` for bash)
- However, `hermes-fly`'s `prereqs.sh` has no shell detection logic
- No logic in `prereqs.sh` to detect `$SHELL`, `ps -p $$`, or parse `echo $0`

**Impact**:
- The Fly.io installer writes to the correct shell config file, but hermes-fly's `prereqs.sh` has no shell awareness to source the right config after installation
- User's current session doesn't have `~/.fly/bin` in PATH until the shell config is reloaded
- hermes-fly cannot provide shell-specific reload guidance without detecting the shell

---

## 3. Solution Design

### High-Level Approach

Three-part fix:

1. **Fix Detection Logic** — Detect both `fly` and `flyctl` as valid Fly CLI binary names
2. **Implement Automatic Shell Config Reload** — Source shell config after installation so tools are immediately available
3. **Improve UX & Error Handling** — Clear messages, verification, fallback guidance

### Part 1: Fix Binary Name Detection

**What to Change**: `lib/prereqs.sh` detection logic

**Current Code** (lines 178-179):
```bash
for tool in fly git curl; do
  command -v "$tool" >/dev/null 2>&1 && continue
```

**New Approach**:

1. Create a helper function `_prereqs_check_tool_available()` that handles tool-name variations:

```bash
# _prereqs_check_tool_available — check if a tool is available by any known name
# Args: TOOL_NAME
# Returns: 0 if available, 1 if not
# Examples:
#   - fly: check for "fly" OR "flyctl"
#   - git: check for "git"
#   - curl: check for "curl"
_prereqs_check_tool_available() {
  local tool="$1"
  case "$tool" in
    fly)
      # Fly.io CLI can be installed as either "fly" (via brew) or "flyctl" (via installer)
      command -v fly >/dev/null 2>&1 && return 0
      command -v flyctl >/dev/null 2>&1 && return 0
      return 1
      ;;
    git|curl)
      # These have standard names
      command -v "$tool" >/dev/null 2>&1 && return 0
      return 1
      ;;
    *)
      # Unknown tool, assume standard name
      command -v "$tool" >/dev/null 2>&1 && return 0
      return 1
      ;;
  esac
}
```

2. Update detection loop (line 179) to use new helper:

```bash
for tool in fly git curl; do
  _prereqs_check_tool_available "$tool" && continue
  # ... rest of install logic
```

**Why This Works**:
- Detects flyctl even though detection variable is "fly"
- Supports both installation methods (brew installs "fly", curl installer creates "flyctl")
- Extensible for future tools with multiple names

---

### Part 2: Automatic Shell Config Reload

**What to Change**: `lib/prereqs.sh` post-installation verification

**Current Code** (lines 149-156):
```bash
# flyctl: add ~/.fly/bin to PATH for current session
if [[ "$tool" == "fly" ]] && [[ -d "${HOME}/.fly/bin" ]]; then
  export PATH="${HOME}/.fly/bin:${PATH}"
  printf '  \033[32m✓\033[0m flyctl installed (added ~/.fly/bin to PATH)\n' >&2
else
  printf '  \033[32m✓\033[0m %s installed\n' "$tool" >&2
fi
```

**New Approach**:

1. Create helper to detect current shell:

```bash
# _prereqs_detect_shell — detect the current shell
# Returns: shell name (zsh, bash, fish, etc.) OR "sh" as fallback
_prereqs_detect_shell() {
  # Try $SHELL environment variable first (most reliable)
  if [[ -n "${SHELL:-}" ]]; then
    basename "$SHELL"
  # Fallback: check what process invoked this script
  elif [[ -n "${ZSH_VERSION:-}" ]]; then
    echo "zsh"
  elif [[ -n "${BASH_VERSION:-}" ]]; then
    echo "bash"
  else
    echo "sh"
  fi
}
```

2. Create helper to determine shell config file:

```bash
# _prereqs_get_shell_config — get the primary config file for the detected shell
# Args: SHELL_NAME
# Returns: path to config file (e.g., ~/.zshrc, ~/.bashrc)
_prereqs_get_shell_config() {
  local shell="$1"
  case "$shell" in
    zsh)
      echo "${HOME}/.zshrc"
      ;;
    bash)
      echo "${HOME}/.bashrc"
      ;;
    fish)
      echo "${HOME}/.config/fish/config.fish"
      ;;
    *)
      # Unknown shell, try common locations
      [[ -f "${HOME}/.zshrc" ]] && echo "${HOME}/.zshrc" && return 0
      [[ -f "${HOME}/.bashrc" ]] && echo "${HOME}/.bashrc" && return 0
      return 1
      ;;
  esac
}
```

3. Create function to reload shell config in current session:

```bash
# _prereqs_reload_shell_config — source the current shell's config file
# This makes PATH updates active in the current session without restart
# Returns: 0 on success, 1 on failure
_prereqs_reload_shell_config() {
  local shell config_file
  shell="$(_prereqs_detect_shell)"
  config_file="$(_prereqs_get_shell_config "$shell")"

  if [[ ! -f "$config_file" ]]; then
    # Config file doesn't exist, nothing to source
    return 1
  fi

  # Source the config file in current shell
  # Use 'source' instead of '.' for clarity (bash/zsh compatible)
  if source "$config_file" 2>/dev/null; then
    return 0
  else
    return 1
  fi
}
```

4. Update post-installation step to call reload:

```bash
# After successful tool installation:
if [[ "$tool" == "fly" ]] && [[ -d "${HOME}/.fly/bin" ]]; then
  # Add to PATH for current session
  export PATH="${HOME}/.fly/bin:${PATH}"

  # Try to reload shell config to activate external installer's PATH updates
  local shell reload_status
  shell="$(_prereqs_detect_shell)"
  if _prereqs_reload_shell_config; then
    printf '  \033[32m✓\033[0m flyctl installed and configured\n' >&2
  else
    # Reload failed, but export is active in current session
    printf '  \033[32m✓\033[0m flyctl installed (PATH updated for this session)\n' >&2
  fi
else
  printf '  \033[32m✓\033[0m %s installed\n' "$tool" >&2
fi
```

**Why This Works**:
- Detects the current shell (zsh, bash, fish)
- Sources the appropriate config file
- Makes Fly.io installer's PATH updates active immediately
- Graceful fallback if reload fails (export already happened)
- Non-technical users don't need to restart terminal or know about shell config

---

### Part 3: Improved UX & Verification

**What to Change**: Error messages, detection flow, verification

#### 3A. Add Post-Install Verification

**New Function**:

```bash
# _prereqs_verify_tool_installed — verify that a tool actually works
# Args: TOOL_NAME
# Returns: 0 if tool is functional, 1 if not
_prereqs_verify_tool_installed() {
  local tool="$1"
  case "$tool" in
    fly)
      # Try running flyctl version to confirm it works
      if command -v flyctl >/dev/null 2>&1; then
        if flyctl version >/dev/null 2>&1; then
          return 0
        fi
      fi
      return 1
      ;;
    git)
      # Check git version
      if git --version >/dev/null 2>&1; then
        return 0
      fi
      return 1
      ;;
    curl)
      # Check curl version
      if curl --version >/dev/null 2>&1; then
        return 0
      fi
      return 1
      ;;
    *)
      # Fallback: just check if command exists
      command -v "$tool" >/dev/null 2>&1 && return 0
      return 1
      ;;
  esac
}
```

#### 3B. Improve Detection Logic

**Current Code** (lines 160-196):
```bash
prereqs_check_and_install() {
  # ... setup code ...
  for tool in fly git curl; do
    command -v "$tool" >/dev/null 2>&1 && continue
    # ... prompt user ...
    prereqs_install_tool "$tool" "$os"
  done
```

**New Code**:
```bash
prereqs_check_and_install() {
  # CI / non-interactive bypass
  if [[ "${CI:-}" == "true" || "${HERMES_FLY_NO_AUTO_INSTALL:-}" == "1" ]]; then
    local any_missing=false
    local tool
    for tool in fly git curl; do
      if ! _prereqs_check_tool_available "$tool"; then
        ui_error "Missing prerequisite: ${tool} (auto-install disabled)"
        any_missing=true
      fi
    done
    [[ "$any_missing" == "false" ]] && return 0 || return 1
  fi

  local os any_failed=false
  os="$(prereqs_detect_os)"

  local tool
  for tool in fly git curl; do
    # Check if tool is already available
    if _prereqs_check_tool_available "$tool"; then
      printf '  ✓ %s available\n' "$tool" >&2
      continue
    fi

    printf '\n  Missing: %s\n' "$tool" >&2
    # ... rest of install prompt and logic ...
  done

  [[ "$any_failed" == "false" ]] && return 0 || return 1
}
```

#### 3C. Clearer Status Messages

**Current**:
```
✓ flyctl installed (added ~/.fly/bin to PATH)
✗ Not authenticated
```

**Problem**: Looks like installation succeeded, but actually tool isn't available

**New Approach**: Use more honest, specific messages:

```bash
# After successful installation and shell reload:
if _prereqs_verify_tool_installed "fly"; then
  printf '  \033[32m✓\033[0m flyctl installed and ready\n' >&2
elif command -v flyctl >/dev/null 2>&1; then
  # Tool exists but verification failed (might not be executable, etc.)
  printf '  \033[32m✓\033[0m flyctl installed but not yet in PATH\n' >&2
  printf '    To use flyctl in this session, run:\n' >&2
  printf '      source ~/.zshrc\n' >&2
  printf '    Or start a new terminal.\n' >&2
else
  # Installation failed completely
  printf '  \033[31m✗\033[0m Could not install flyctl\n' >&2
  prereqs_show_guide "fly" "$os" "..." "..."
fi
```

#### 3D. Better Fallback Guidance

**Current Code** (lines 45-70): `prereqs_show_guide()` shows a fallback guide

**New Approach**: Make guidance context-aware

```bash
prereqs_show_guide() {
  local tool="$1" os="$2" attempted="${3:-}" last_error="${4:-}"

  # ... existing header code ...

  # Add shell-specific guidance
  if [[ "$tool" == "fly" ]]; then
    local shell config_file
    shell="$(_prereqs_detect_shell)"
    config_file="$(_prereqs_get_shell_config "$shell")"

    printf '\n    After installing, run:\n' >&2
    printf '      source %s\n' "$config_file" >&2
    printf '\n    Or start a new terminal.\n' >&2
  fi
}
```

---

## 4. Implementation Tasks

### Phase 1: Detection Fixes (Critical Path)

**Task 1.1**: Add `_prereqs_check_tool_available()` function
- Location: `lib/prereqs.sh` after line 40 (after `prereqs_detect_os()`)
- Handles: fly/flyctl name variations
- Tests: Unit test with both binary names

**Task 1.2**: Add `_prereqs_verify_tool_installed()` function
- Location: `lib/prereqs.sh` after detection helpers
- Handles: Run version command to verify tool actually works
- Tests: Unit tests with mocked binaries

**Task 1.3**: Update detection loop in `prereqs_check_and_install()`
- Location: `lib/prereqs.sh` line 179
- Change: `command -v "$tool"` → `_prereqs_check_tool_available "$tool"`
- Impact: Fixes repeated installation issue

---

### Phase 2: Shell Config Reload (High Priority)

**Task 2.1**: Add shell detection helpers
- `_prereqs_detect_shell()` — detect current shell (zsh, bash, fish, etc.)
- Location: `lib/prereqs.sh` before Phase 1 helpers
- Tests: Test each shell type

**Task 2.2**: Add shell config file resolver
- `_prereqs_get_shell_config()` — return path to config file for detected shell
- Location: `lib/prereqs.sh` after `_prereqs_detect_shell()`
- Tests: Test with each shell's config file

**Task 2.3**: Add shell config reload function
- `_prereqs_reload_shell_config()` — source the config file in current session
- Location: `lib/prereqs.sh` after shell helpers
- Tests: Test reload actually makes PATH updates active
- Error handling: Graceful fallback if reload fails

**Task 2.4**: Integrate reload into post-install flow
- Location: `lib/prereqs.sh` lines 149-156 (`prereqs_install_tool()`)
- Change: After `export PATH=...`, call `_prereqs_reload_shell_config()`
- Message update: Report success/failure of reload attempt

---

### Phase 3: UX Improvements (Medium Priority)

**Task 3.1**: Improve status messages
- Location: `lib/prereqs.sh` lines 149-156
- Change: Replace generic "✓ flyctl installed" with context-aware messages
- Messages should indicate:
  - Tool is installed AND available now
  - Tool is installed but needs reload (fallback path)
  - Tool installation failed (error path)

**Task 3.2**: Update fallback guidance
- Location: `lib/prereqs.sh` `prereqs_show_guide()` function
- Add shell-specific instructions (which config file to source)
- Make instructions copy-pasteable

**Task 3.3**: Add verbose logging (optional)
- When `HERMES_FLY_VERBOSE=1`, log each detection step
- Example: "Detecting shell: zsh, config file: ~/.zshrc, reloading..."
- Helps users understand what's happening

### Phase 2.5: Installation Validation (High Priority)

**Task 2.5.1**: Add prerequisite checking to scripts/install.sh
- Location: `scripts/install.sh` after line 133 (after main install completes)
- Behavior: Call `_prereqs_check_and_install()` to validate/install fly, git, curl
- If all prerequisites available: print success message "All prerequisites available"
- If installation succeeds: print "Prerequisites installed successfully"
- If installation fails: print clear, shell-specific remediation instructions
- Non-blocking: Do NOT fail the hermes-fly install if prerequisites are missing
- Impact: Catches prerequisite issues at install time (better UX than discovering during deploy)

---

## 5. Testing Strategy

### Unit Tests (New/Modified)

**File**: `tests/prereqs.bats` (expand existing) + `tests/prereqs_edge_cases.bats` (add edge cases)

**Test Cases**:

#### Detection Tests
```bash
@test "check_tool_available: detects 'fly' binary (brew install)" {
  # Mock 'fly' in PATH
  export PATH="${BATS_TEST_DIRNAME}/mocks/fly-binary:$PATH"
  run _prereqs_check_tool_available "fly"
  [ "$status" -eq 0 ]
}

@test "check_tool_available: detects 'flyctl' binary (curl installer)" {
  # Mock 'flyctl' (not 'fly') in PATH
  export PATH="${BATS_TEST_DIRNAME}/mocks/flyctl-binary:$PATH"
  run _prereqs_check_tool_available "fly"
  [ "$status" -eq 0 ]
}

@test "check_tool_available: returns 1 when neither 'fly' nor 'flyctl' exists" {
  export PATH="/empty"
  run _prereqs_check_tool_available "fly"
  [ "$status" -eq 1 ]
}
```

#### Shell Detection Tests
```bash
@test "detect_shell: returns 'zsh' when ZSH_VERSION is set" {
  export ZSH_VERSION="5.8"
  run _prereqs_detect_shell
  [ "$status" -eq 0 ]
  [ "$output" = "zsh" ]
}

@test "detect_shell: returns 'bash' when running bash" {
  unset ZSH_VERSION
  export BASH_VERSION="5.0.0"
  run _prereqs_detect_shell
  [ "$status" -eq 0 ]
  [ "$output" = "bash" ]
}

@test "detect_shell: uses \$SHELL environment variable if set" {
  export SHELL="/bin/zsh"
  run _prereqs_detect_shell
  [ "$status" -eq 0 ]
  [ "$output" = "zsh" ]
}
```

#### Shell Config Resolution Tests
```bash
@test "get_shell_config: returns ~/.zshrc for zsh" {
  run _prereqs_get_shell_config "zsh"
  [ "$status" -eq 0 ]
  [ "$output" = "${HOME}/.zshrc" ]
}

@test "get_shell_config: returns ~/.bashrc for bash" {
  run _prereqs_get_shell_config "bash"
  [ "$status" -eq 0 ]
  [ "$output" = "${HOME}/.bashrc" ]
}

@test "get_shell_config: handles unknown shell" {
  run _prereqs_get_shell_config "fish"
  [ "$status" -eq 0 ]
  [ "$output" = "${HOME}/.config/fish/config.fish" ]
}
```

#### Shell Reload Tests
```bash
@test "reload_shell_config: sources .zshrc and updates PATH" {
  # Create a test config file that adds a test dir to PATH
  local test_dir="/test/path/added/by/config"
  mkdir -p "${BATS_TMPDIR}/zsh_config_test"

  # Create mock ~/.zshrc that adds to PATH
  local zshrc="${BATS_TMPDIR}/zsh_config_test/.zshrc"
  cat > "$zshrc" <<EOF
export PATH="${test_dir}:\$PATH"
EOF

  export HOME="${BATS_TMPDIR}/zsh_config_test"
  export SHELL="/bin/zsh"

  # Before reload, test_dir not in PATH
  [[ ! "$PATH" =~ "$test_dir" ]]

  # Run reload (in zsh subshell to test)
  # This is tricky to test — might need to source within the test
  # For now, verify reload function exists and can be called
  run _prereqs_reload_shell_config
  # Status depends on whether we're in zsh; skip for now
}
```

#### Verification Tests
```bash
@test "verify_tool_installed: succeeds when flyctl works" {
  # Mock flyctl that responds to 'version'
  mkdir -p "${BATS_TMPDIR}/bin"
  cat > "${BATS_TMPDIR}/bin/flyctl" <<'EOF'
#!/bin/bash
if [[ "$1" == "version" ]]; then
  echo "flyctl v0.0.326"
fi
EOF
  chmod +x "${BATS_TMPDIR}/bin/flyctl"

  export PATH="${BATS_TMPDIR}/bin:$PATH"
  run _prereqs_verify_tool_installed "fly"
  [ "$status" -eq 0 ]
}

@test "verify_tool_installed: fails when tool not found" {
  export PATH="/empty"
  run _prereqs_verify_tool_installed "fly"
  [ "$status" -eq 1 ]
}

@test "verify_tool_installed: fails when tool doesn't respond to version" {
  # Mock flyctl that exits with error
  mkdir -p "${BATS_TMPDIR}/bin"
  cat > "${BATS_TMPDIR}/bin/flyctl" <<'EOF'
#!/bin/bash
exit 1
EOF
  chmod +x "${BATS_TMPDIR}/bin/flyctl"

  export PATH="${BATS_TMPDIR}/bin:$PATH"
  run _prereqs_verify_tool_installed "fly"
  [ "$status" -eq 1 ]
}
```

---

### Integration Tests

**File**: `tests/integration.bats` (new test scenario)

```bash
@test "hermes-fly deploy: installs flyctl once, detects on second run" {
  export HERMES_FLY_VERBOSE=1

  # First run: should install flyctl
  run ./hermes-fly deploy <<< "test-app"$'\n'"y"$'\n'"no"$'\n'
  [ "$status" -eq 0 ] || [ "$status" -eq 1 ]  # Might fail on auth, but prereqs should work
  [[ "$output" == *"flyctl installed"* ]]

  # Verify flyctl is now available
  [[ "$(command -v flyctl || echo "not found")" != "not found" ]]

  # Second run: should NOT reinstall
  run ./hermes-fly deploy <<< "test-app"$'\n'"no"$'\n'
  [[ "$output" != *"Installing fly"* ]]  # Should skip install
  [[ "$output" == *"flyctl available"* ]] || [[ "$output" == *"fly available"* ]]
}

@test "hermes-fly deploy: flyctl works immediately after install" {
  # After install, flyctl should be available in same session
  run ./hermes-fly deploy <<< "test-app"$'\n'"y"$'\n'"no"$'\n'

  # Check that flyctl is in PATH and works
  run flyctl version
  [ "$status" -eq 0 ]
  [[ "$output" == *"flyctl v"* ]]
}
```

---

### Manual Testing Checklist

**Linux (Debian/Ubuntu) - Fresh Installation**:
- [ ] Run `curl -fsSL https://raw.githubusercontent.com/alexfazio/hermes-fly/main/scripts/install.sh | bash`
- [ ] Run `hermes-fly deploy` (should install flyctl)
- [ ] Verify: Can immediately use `flyctl version` in same terminal (no restart needed)
- [ ] Run `hermes-fly deploy` again (should skip flyctl install)
- [ ] Verify: Second run shows "flyctl available" (not "installing")

**macOS (bash) - Fresh Installation**:
- [ ] Repeat above steps with bash shell
- [ ] Verify: Config updates go to `~/.bash_profile` or `~/.bashrc` (depending on shell)
- [ ] Verify: PATH reload works with bash

**macOS (zsh) - With brew Pre-installed**:
- [ ] Install flyctl via brew: `brew install flyctl`
- [ ] Run `hermes-fly deploy` (should detect existing flyctl)
- [ ] Verify: Does NOT attempt to re-install flyctl

**Error Case: Installation Fails (Network Down)**:
- [ ] Block network temporarily
- [ ] Run `hermes-fly deploy`
- [ ] Verify: Clear error message with fallback instructions
- [ ] Verify: Instructions include shell-specific guidance (source ~/.zshrc, etc.)

**Error Case: Wrong Shell Config**:
- [ ] Manually break PATH in `~/.zshrc` (remove ~/. fly/bin entry)
- [ ] Run `hermes-fly deploy`
- [ ] Verify: Message indicates flyctl is installed but may need reload
- [ ] Verify: User is directed to run `source ~/.zshrc`

**Sprite VM (Fly.io Infrastructure) - Linux/amd64 - Quick Validation**:
- [ ] Connect to sprite VM: `sprite console -s hermes-fly-test`
- [ ] Run `curl -fsSL https://raw.githubusercontent.com/alexfazio/hermes-fly/main/scripts/install.sh | bash`
- [ ] Run `hermes-fly deploy` first time (should install flyctl)
- [ ] Verify: `flyctl version` works immediately in same terminal (no restart)
- [ ] Run `hermes-fly deploy` second time (should skip flyctl install)
- [ ] Verify: Output shows "✓ fly available" (not "Installing fly")

**Sprite VM (Fly.io Infrastructure) - Linux/amd64 - End-to-End Deployment**:
- [ ] On sprite VM, run full deployment flow: `hermes-fly deploy`
- [ ] Deploy a test app (e.g., simple Python hello-world)
- [ ] Verify app is live on Fly.io and accessible via HTTP
- [ ] Verify flyctl is available and working: `flyctl status -a [app-name]`
- [ ] Clean up: `flyctl destroy -a [app-name]` (or use hermes-fly destroy)

---

## 6. Edge Cases & Mitigations

### Edge Case 1: User Running Non-Standard Shell

**Scenario**: User runs `hermes-fly` from a shell that's not zsh/bash/fish

**Current Behavior**: Shell detection defaults to "sh", but `sh` doesn't have a config file → reload fails

**Mitigation**:
- Detect shell and log warning: "Running unsupported shell; PATH updates may not persist"
- Still set `export PATH=...` (works in current session)
- Suggest user switch to bash/zsh for full compatibility
- Don't fail — let user continue with current-session-only PATH

**Code**:
```bash
_prereqs_detect_shell() {
  local shell
  shell="${SHELL##*/}"  # Get basename of $SHELL

  if [[ "$shell" =~ ^(bash|zsh|fish|ksh|tcsh)$ ]]; then
    echo "$shell"
  else
    printf '  \033[33m⚠\033[0m Warning: running %s (unsupported shell)\n' "$shell" >&2
    printf '    PATH updates may not persist across sessions.\n' >&2
    printf '    Consider using bash or zsh.\n' >&2
    echo "sh"  # Fall back
  fi
}
```

---

### Edge Case 2: User Has No Shell Config File

**Scenario**: `~/.zshrc` doesn't exist (minimal shell setup)

**Current Behavior**: `source ~/.zshrc` fails → reload fails

**Mitigation**:
- Check if config file exists before trying to source
- If it doesn't exist, that's OK — just use the `export PATH=...`
- Don't print error, but do indicate PATH is only active in current session

**Code**:
```bash
_prereqs_reload_shell_config() {
  local config_file
  config_file="$(_prereqs_get_shell_config "$(_prereqs_detect_shell)")"

  if [[ ! -f "$config_file" ]]; then
    # Config file doesn't exist; nothing to reload
    # This is OK — we already did export PATH above
    return 0  # Not an error
  fi

  if source "$config_file" 2>/dev/null; then
    return 0
  else
    return 1
  fi
}
```

---

### Edge Case 3: Fly.io Installer Adds to Wrong Config File

**Scenario**: Fly.io installer adds to `~/.bashrc` but user is running zsh

**Current Behavior**: PATH update is in the wrong file → doesn't take effect

**Mitigation**:
- Our reload targets the correct file (detected based on current shell)
- So even if Fly.io installer updated the wrong file, our reload will work
- No special handling needed, but be aware Fly.io installer might update multiple files

---

### Edge Case 4: Permission Denied / sudo Required

**Scenario**: User doesn't have write permission to `~/.zshrc` (rare but possible)

**Current Behavior**: `source ~/.zshrc` might fail

**Mitigation**:
- Wrap `source` in error handling
- If reload fails, don't abort — export PATH still works
- Suggest user contact system admin or use different install location

**Code**: Already handled above in `_prereqs_reload_shell_config()` with `2>/dev/null`

---

### Edge Case 5: Flyctl Binary Corrupted or Incomplete

**Scenario**: Fly.io installer succeeded, but binary is incomplete/unexecutable

**Current Behavior**: Detection says "installed" but verification fails

**Mitigation**:
- Use verification function to test if `flyctl version` actually works
- If verification fails, show error instead of success
- Suggest re-running install or checking Fly.io docs

**Code**: `_prereqs_verify_tool_installed()` handles this

---

### Edge Case 6: Multiple PATH Additions (Idempotency)

**Scenario**: User runs `hermes-fly deploy` multiple times, each time adding to PATH

**Current Behavior**: `export PATH="${HOME}/.fly/bin:${PATH}"` prepends every time → PATH gets longer

**Mitigation**:
- Only add to PATH if not already there: `[[ ":$PATH:" =~ ":${HOME}/.fly/bin:" ]] || export PATH=...`
- Better: use the detection function (which uses `command -v`) instead of blindly exporting

**Code**:
```bash
# Instead of always exporting, only export if needed
if ! _prereqs_check_tool_available "fly"; then
  # Tool not available, add to PATH
  export PATH="${HOME}/.fly/bin:${PATH}"
fi
```

---

## 7. Success Criteria

### Functional Requirements

- [ ] **Detection is idempotent**: Running `hermes-fly deploy` twice doesn't attempt to re-install flyctl
  - Verify: Second run shows "✓ fly available" (not "Installing fly...")

- [ ] **Tools available immediately**: After installation, tool works in the same shell session without restart
  - Verify: After install, `flyctl version` succeeds without `source ~/.zshrc` or terminal restart
  - Test: Both zsh and bash shells

- [ ] **Binary name variations handled**: Detects "fly" (from brew) and "flyctl" (from curl installer)
  - Verify: Detection works after both `brew install flyctl` and `curl | sh` install methods
  - Test: Both installation methods on macOS

- [ ] **Cross-platform shell support**: Works on zsh, bash, fish (and gracefully degrades for others)
  - Verify: Tested on zsh and bash on both macOS and Linux
  - Test: Fish shell (if time permits)

---

### UX Requirements

- [ ] **Clearer messages**: Users understand whether tool is installed, available, or needs action
  - Verify: Messages distinguish between "installed but needs reload" and "installation failed"

- [ ] **Fallback guidance**: If auto-install fails, user gets clear next steps
  - Verify: Error messages include manual install command and Fly.io docs link
  - Verify: Includes shell-specific instruction (e.g., "run: source ~/.zshrc")

- [ ] **No terminal expertise required**: Non-technical users can complete deploy without understanding:
  - Shell config files
  - PATH environment variable
  - `source` command
  - Verify: Test with a user who's unfamiliar with these concepts

---

### Testing Requirements

- [ ] **Unit tests**: >10 new tests covering detection, shell detection, reload
- [ ] **Integration tests**: End-to-end test of install → verify → reuse
- [ ] **Manual tests**: macOS (bash+zsh), Linux (bash+zsh)
- [ ] **Edge cases**: Missing config files, wrong shell, corrupted binary

---

## 8. Implementation Order

### Phase 1: Core Detection Fix (Day 1)
1. Add `_prereqs_check_tool_available()` function
2. Update detection loop to use new function
3. Write and pass unit tests
4. Verify idempotency: `hermes-fly deploy` twice doesn't re-install

### Phase 2: Shell Config Reload (Day 2)
1. Add shell detection helpers
2. Add config file resolution
3. Add reload function
4. Integrate into post-install flow
5. Write and pass integration tests
6. Manual test on macOS + Linux

### Phase 3: UX Improvements (Day 3)
1. Add verification function
2. Update messages
3. Improve fallback guidance
4. Add verbose logging
5. Manual testing with non-technical user
6. Update EDGE_CASE_HANDLING.md documentation

### Phase 4: Testing & Validation (Day 4)
1. Run full test suite
2. Test all edge cases
3. Test cross-platform (macOS zsh, macOS bash, Linux bash, Linux zsh)
4. Documentation updates (PSF, README, EDGE_CASE_HANDLING.md)

---

## 9. Risk Mitigation

### Risk: Breaking Change for Existing Users

**Risk**: Changes to detection logic might break custom PATH setups

**Mitigation**:
- New detection is backward-compatible (checks for "fly" first, then "flyctl")
- Shell reload is optional — if it fails, code still works (export PATH already happened)
- Verbose logging helps diagnose issues

---

### Risk: Cross-Platform Issues

**Risk**: Shell handling differs between macOS and Linux

**Mitigation**:
- Test on both macOS (bash, zsh) and Linux (bash, zsh)
- Shell detection uses standard variables (`$SHELL`, `ZSH_VERSION`, `BASH_VERSION`)
- Fallback to generic shell handling if detection fails

---

### Risk: External Installer Changes

**Risk**: Fly.io changes how they install flyctl (different path, different name)

**Mitigation**:
- Our verification function tests if tool actually works (`flyctl version`)
- If Fly.io changes, verification will catch it
- We surface clear error messages with fallback guidance

---

## 10. Future Improvements (Out of Scope)

- [ ] Support for non-interactive CI environments (use `HERMES_FLY_NO_AUTO_INSTALL=1`)
- [ ] Caching of prerequisite detection results (to skip checks on subsequent calls)
- [ ] Automatic retry if installation fails (exponential backoff)
- [ ] Pre-download binaries to avoid relying on external installers
- [ ] Native support for Windows (WSL) shell environments
- [ ] Integration with package managers other than apt (yum, pacman, etc.)

---

## 11. Documentation Updates Required

### PSF Updates
- [ ] Update `docs/psf/05-testing-and-qa.md` — document new test functions
- [ ] Update `docs/psf/08-maintainability.md` — reference remediation plan

### User-Facing Docs
- [ ] Update `docs/EDGE_CASE_HANDLING.md` — add new edge cases + solutions
- [ ] Update `docs/getting-started.md` — simplify prerequisite section ("they just work now")
- [ ] Update `README.md` — simplified "getting started" (no shell reload step)
- [ ] Update `docs/configuration.md` — add "Version Management" section documenting `HERMES_FLY_FLYCTL_VERSION` environment variable override (for power users and CI environments wanting to pin specific versions)

---

## 12. Detailed Code Diff Preview

### File: lib/prereqs.sh

#### Addition 1: Shell Detection Helpers (after line 40)

```bash
# _prereqs_detect_shell — detect the current shell
# Returns: shell name (zsh, bash, fish, sh, etc.)
_prereqs_detect_shell() {
  local shell

  # Try $SHELL environment variable (most reliable)
  if [[ -n "${SHELL:-}" ]]; then
    shell="${SHELL##*/}"  # Get basename
    # Verify it's a known shell, otherwise use version detection
    case "$shell" in
      bash|zsh|fish|ksh|tcsh|sh) echo "$shell"; return 0 ;;
    esac
  fi

  # Version detection for shells running the script
  [[ -n "${ZSH_VERSION:-}" ]] && echo "zsh" && return 0
  [[ -n "${BASH_VERSION:-}" ]] && echo "bash" && return 0
  [[ -n "${KSH_VERSION:-}" ]] && echo "ksh" && return 0
  [[ -n "${FCEDIT:-}" ]] && echo "ksh" && return 0

  # Fallback to sh
  echo "sh"
}

# _prereqs_get_shell_config — get the primary config file for the detected shell
# Args: SHELL_NAME
# Returns: path to config file (e.g., ~/.zshrc, ~/.bashrc)
_prereqs_get_shell_config() {
  local shell="$1"
  case "$shell" in
    zsh)
      echo "${HOME}/.zshrc"
      ;;
    bash)
      # Prefer ~/.bash_profile on macOS if it exists, otherwise ~/.bashrc
      [[ -f "${HOME}/.bash_profile" ]] && echo "${HOME}/.bash_profile" || echo "${HOME}/.bashrc"
      ;;
    fish)
      echo "${HOME}/.config/fish/config.fish"
      ;;
    ksh|tcsh)
      echo "${HOME}/.profile"
      ;;
    *)
      # Try common locations
      [[ -f "${HOME}/.zshrc" ]] && echo "${HOME}/.zshrc" && return 0
      [[ -f "${HOME}/.bashrc" ]] && echo "${HOME}/.bashrc" && return 0
      [[ -f "${HOME}/.profile" ]] && echo "${HOME}/.profile" && return 0
      return 1
      ;;
  esac
}

# _prereqs_reload_shell_config — source the current shell's config file
# This makes PATH updates from external installers active in current session
# Returns: 0 on success, 1 on failure
_prereqs_reload_shell_config() {
  local shell config_file
  shell="$(_prereqs_detect_shell)"
  config_file="$(_prereqs_get_shell_config "$shell")" || return 1

  if [[ ! -f "$config_file" ]]; then
    # Config file doesn't exist, nothing to reload
    # This is acceptable — export PATH already happened above
    return 0
  fi

  # Source the config file to activate PATH updates
  if source "$config_file" 2>/dev/null; then
    return 0
  else
    return 1
  fi
}
```

#### Addition 2: Tool Availability Check (after shell helpers)

```bash
# _prereqs_check_tool_available — check if a tool is available by any known name
# Args: TOOL_NAME
# Returns: 0 if available, 1 if not
# Examples:
#   - fly: check for "fly" (brew) OR "flyctl" (curl installer)
#   - git: check for "git"
#   - curl: check for "curl"
_prereqs_check_tool_available() {
  local tool="$1"
  case "$tool" in
    fly)
      # Fly.io CLI can be installed as "fly" (brew) or "flyctl" (curl installer)
      if command -v fly >/dev/null 2>&1; then
        return 0
      fi
      if command -v flyctl >/dev/null 2>&1; then
        return 0
      fi
      return 1
      ;;
    git|curl)
      # These have standard names
      command -v "$tool" >/dev/null 2>&1
      ;;
    *)
      # Unknown tool, assume standard name
      command -v "$tool" >/dev/null 2>&1
      ;;
  esac
}

# _prereqs_verify_tool_installed — verify that a tool actually works
# Args: TOOL_NAME
# Returns: 0 if tool is functional, 1 if not
_prereqs_verify_tool_installed() {
  local tool="$1"
  case "$tool" in
    fly)
      # Check if flyctl works
      if command -v flyctl >/dev/null 2>&1 && flyctl version >/dev/null 2>&1; then
        return 0
      fi
      if command -v fly >/dev/null 2>&1 && fly version >/dev/null 2>&1; then
        return 0
      fi
      return 1
      ;;
    git)
      git --version >/dev/null 2>&1
      ;;
    curl)
      curl --version >/dev/null 2>&1
      ;;
    *)
      command -v "$tool" >/dev/null 2>&1
      ;;
  esac
}
```

#### Modification 1: Update post-install section (lines 149-156)

```bash
# After tool is installed, configure for current session
if [[ "$tool" == "fly" ]] && [[ -d "${HOME}/.fly/bin" ]]; then
  # Add to PATH for current session
  export PATH="${HOME}/.fly/bin:${PATH}"

  # Try to reload shell config to activate external installer's PATH updates
  if _prereqs_reload_shell_config; then
    printf '  \033[32m✓\033[0m flyctl installed and configured\n' >&2
  else
    # Reload failed, but export is active in current session
    local shell config_file
    shell="$(_prereqs_detect_shell)"
    config_file="$(_prereqs_get_shell_config "$shell")" || config_file="~/.zshrc"

    printf '  \033[32m✓\033[0m flyctl installed\n' >&2
    printf '    To use flyctl in this session, run:\n' >&2
    printf '      source %s\n' "$config_file" >&2
  fi
else
  printf '  \033[32m✓\033[0m %s installed\n' "$tool" >&2
fi
```

#### Modification 2: Update detection loop (line 179)

Change from:
```bash
for tool in fly git curl; do
  command -v "$tool" >/dev/null 2>&1 && continue
```

To:
```bash
for tool in fly git curl; do
  _prereqs_check_tool_available "$tool" && continue
```

Also update the detection loop to show status for available tools:

```bash
for tool in fly git curl; do
  if _prereqs_check_tool_available "$tool"; then
    # Tool is already available, skip
    printf '  ✓ %s available\n' "$tool" >&2
    continue
  fi

  # Tool is missing, prompt for install
  printf '\n  Missing: %s\n' "$tool" >&2
  # ... rest of install logic ...
done
```

---

## 13. Success Metrics

After implementation, measure:

1. **Idempotency**: Second `hermes-fly deploy` should skip prerequisite installation (0 install attempts vs. 2 before)
2. **Session availability**: Tools work immediately after install without shell restart (100% vs. 0% before)
3. **User confusion**: Error messages make sense and include next steps (measured via user testing)
4. **Cross-platform**: Works on macOS (zsh, bash) and Linux (bash, zsh) without special user action
5. **Non-technical users**: Can complete deploy without understanding shell config or PATH concepts

---

## 14. Timeline & Resource Estimate

- **Phase 1** (Core detection): 2-3 hours
- **Phase 2** (Shell reload): 2-3 hours
- **Phase 3** (UX): 2-3 hours
- **Phase 4** (Testing & validation): 3-4 hours
- **Documentation**: 1-2 hours

**Total**: 10-15 hours

---

## Appendix: Related Issues & Links

- **Issue**: Linux users experience repeated prerequisite installation
- **Root cause**: Shell config not reloaded in current session + hermes-fly lacks shell detection
- **Related files**:
  - `lib/prereqs.sh` — prerequisite detection & installation
  - `scripts/install.sh` — hermes-fly installer
  - `lib/deploy.sh` — deployment orchestrator (calls prereqs)
  - `docs/EDGE_CASE_HANDLING.md` — edge case documentation
  - `tests/prereqs*.bats` — prerequisite tests
- **Similar tools**: Similar shell config reload patterns in `rustup`, `nvm`, `pyenv`

---

## References

- [Fly.io flyctl installation documentation](https://fly.io/docs/flyctl/install/)
- [Fly.io install.sh script](https://fly.io/install.sh)
- [BATS-core GitHub repository](https://github.com/bats-core/bats-core)

