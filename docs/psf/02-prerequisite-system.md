# Prerequisite System

PSF for the prerequisite detection, auto-install, and fallback guidance module.

**Related PSFs**: [00-architecture](00-hermes-fly-architecture-overview.md) | [01-entry-point](01-cli-entry-and-dispatch.md) | [05-testing](05-testing-and-qa.md) | [08-maintainability](08-maintainability.md)

## 1. Scope

| Path | Lines | Functions | Role |
|------|-------|-----------|------|
| `lib/prereqs.sh` | 349 | 10 | Platform detection, tool availability checks, auto-install with fallback guides |

The module manages three required prerequisites: `fly` (flyctl CLI), `git`, and `curl`. It detects the OS and package manager, offers interactive installation, verifies post-install availability, and falls back to manual guidance when auto-install fails.

## 2. Platform Detection

### 2.1 `prereqs_detect_os()`

Detects the current platform and available package manager.

```bash
prereqs_detect_os()
# Returns: platform string to stdout
```

| Platform | Package Manager | Return Value |
|----------|-----------------|--------------|
| macOS | Homebrew available | `Darwin:brew` |
| macOS | No Homebrew | `Darwin:no-brew` |
| Linux | apt-get available | `Linux:apt` |
| Linux | No apt-get | `Linux:unsupported` |
| Other | N/A | `unsupported` |

Uses `${HERMES_FLY_PLATFORM:-$(uname -s)}` for testability. Empty or unset `HERMES_FLY_PLATFORM` falls back to `uname -s` via standard bash default expansion.

## 3. Tool Availability

### 3.1 `_prereqs_check_tool_available()`

Multi-strategy check for whether a tool is accessible in the current process.

```bash
_prereqs_check_tool_available TOOL
# Args:    TOOL — "fly", "git", or "curl"
# Returns: 0 if found, 1 if not found
# Effect:  May export PATH when fly is discovered outside current PATH
```

For `git` and `curl`, performs a standard `command -v` check.

For `fly`, uses a three-tier detection chain:

```text
1. command -v fly + fly version    → found on PATH
2. command -v flyctl               → add flyctl dir to PATH, recheck fly
3. ~/.fly/bin/fly (file check)     → add ~/.fly/bin to PATH, recheck fly
```

Key behaviors:
- Each tier verifies the binary is callable (`fly version` must succeed), not just discoverable
- PATH mutations are guarded with dedup checks (`":${PATH}:" != *":dir:"*`)
- PATH is restored to its original value if all tiers fail (no side effects)
- File-path checks (tier 3) are skipped when `HERMES_FLY_TEST_MODE=1`
- PATH export is skipped in CI environments (`CI=true`) to avoid masking missing PATH configuration

## 4. Shell Awareness Helpers

Three internal utilities for detecting and reloading shell configuration after external installers modify config files.

### 4.1 `_prereqs_detect_shell()`

```bash
_prereqs_detect_shell
# Returns: shell name to stdout (zsh, bash, fish, sh)
```

Detection priority:
1. `$SHELL` env var (user's login shell) — extracts basename
2. `$ZSH_VERSION` — returns `zsh` (only when `$SHELL` is unset)
3. `$BASH_VERSION` — returns `bash` (only when both above are unset)
4. Fallback: `sh`

### 4.2 `_prereqs_get_shell_config()`

```bash
_prereqs_get_shell_config SHELL_NAME
# Returns: config file path to stdout, exit 1 for unknown shells
```

| Shell | Config File |
|-------|-------------|
| `zsh` | `~/.zshrc` |
| `bash` | `~/.bashrc` |
| `fish` | `~/.config/fish/config.fish` |
| Other | returns 1 |

### 4.3 `_prereqs_reload_shell_config()`

```bash
_prereqs_reload_shell_config
# Returns: 0 on success, 1 on failure
# Effect:  Applies PATH exports from shell config to current process
```

Safely extracts only `export PATH=` lines via `grep -E '^export PATH='` and evals them individually. Does not source the full config file — avoids side effects from aliases, functions, or `exit` commands in user configs.

This function is a utility available for future use. The active install flow handles PATH updates via `_prereqs_check_tool_available()` instead.

## 5. Fallback Guidance

### 5.1 `prereqs_show_guide()`

```bash
prereqs_show_guide TOOL OS [ATTEMPTED] [LAST_ERROR]
# Output: manual install instructions to stderr
```

Displays a diagnostic block with:
- Failed tool name and OS context (when `ATTEMPTED` is provided)
- The command that was attempted and its error output
- Manual install command for the tool/OS combination
- Reference URL (fly.io, git-scm.com, or curl.se)
- Re-run instruction (`hermes-fly deploy`)

### 5.2 `_prereqs_manual_cmd()`

```bash
_prereqs_manual_cmd TOOL OS
# Returns: manual install command string to stdout
```

Maps `tool:os` combinations to install commands:

| Tool:OS | Command |
|---------|---------|
| `fly:Darwin:brew` | `brew install flyctl` |
| `fly:Darwin:no-brew` | `curl -L https://fly.io/install.sh \| sh` |
| `fly:Linux:apt` | `curl -L https://fly.io/install.sh \| sh` |
| `git:Darwin:*` | `xcode-select --install` |
| `git:Linux:apt` | `sudo apt-get install -y git` |
| `curl:Linux:apt` | `sudo apt-get install -y curl` |

### 5.3 `_prereqs_build_install_cmd()`

```bash
_prereqs_build_install_cmd TOOL OS
# Returns: install command string to stdout, exit 1 if unsupported
```

Same mapping as `_prereqs_manual_cmd` but with two differences:
- Linux apt-get commands include `sudo apt-get update &&` prefix
- flyctl install command can be overridden via `HERMES_FLY_FLYCTL_INSTALL_CMD`
- Returns exit 1 for unsupported combinations (e.g., `curl:Darwin`, `*:unsupported`)

## 6. Install Flow

### 6.1 `prereqs_install_tool()`

```bash
prereqs_install_tool TOOL OS
# Returns: 0 on success, 1 on failure
```

Sequence:

```text
1. Build install command via _prereqs_build_install_cmd()
     → failure: show guide, return 1
2. Execute install command
     → HERMES_FLY_VERBOSE=1: stream output directly
     → default: capture to temp file, dump on failure
3. Post-install verification (fly only)
     → call _prereqs_check_tool_available("fly")
     → failure: print shell-specific hint ("source ~/.zshrc" or "restart your terminal")
4. PATH update (fly only)
     → add ~/.fly/bin to PATH with dedup guard
5. Print success: "✓ flyctl installed and ready" or "✓ TOOL installed"
```

### 6.2 `prereqs_check_and_install()`

Top-level orchestrator called during deploy preflight.

```bash
prereqs_check_and_install
# Returns: 0 if all tools available, 1 if any failed
```

Two modes:

**CI / non-interactive mode** (`CI=true` or `HERMES_FLY_NO_AUTO_INSTALL=1`):
- Iterates `fly git curl`, checks each with `_prereqs_check_tool_available`
- Reports missing tools with `ui_error`, does not prompt
- Returns 1 if any missing

**Interactive mode** (default):
- Detects OS via `prereqs_detect_os()`
- Iterates `fly git curl`, checks each with `_prereqs_check_tool_available`
- For missing tools: shows install command, prompts `ui_confirm`
- User accepts: calls `prereqs_install_tool`
- User declines: shows manual guide via `prereqs_show_guide`
- Returns 1 if any tool remains missing

## 7. Environment Variable Overrides

| Variable | Purpose | Default |
|----------|---------|---------|
| `HERMES_FLY_PLATFORM` | Override `uname -s` for platform detection | unset (uses `uname -s`) |
| `HERMES_FLY_NO_AUTO_INSTALL` | Set to `1` to disable interactive install prompts | unset |
| `HERMES_FLY_FLYCTL_INSTALL_CMD` | Override the flyctl install command | `curl -L https://fly.io/install.sh \| sh` |
| `HERMES_FLY_TEST_MODE` | Set to `1` to skip `~/.fly/bin` file-path checks | unset |
| `HERMES_FLY_VERBOSE` | Set to `1` to stream install output directly | `0` |
| `CI` | Set to `true` to skip all install prompts | unset |

## 8. Module Guard

Standard source-only guard and dependency sourcing:

```bash
# Prevent direct execution
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "Error: source this file, do not execute directly." >&2
  exit 1
fi

# Source ui.sh only if not already loaded (EXIT_SUCCESS is readonly)
if [[ -z "${EXIT_SUCCESS+x}" ]]; then
  source "${_PREREQS_SCRIPT_DIR}/ui.sh" 2>/dev/null || true
fi
```

## 9. Testing

### 9.1 Coverage

| File | Tests | Focus |
|------|-------|-------|
| `tests/prereqs.bats` | 76 | Unit tests: detect_os, show_guide, install_tool, check_and_install, shell helpers |
| `tests/prereqs_edge_cases.bats` | 57 | Edge cases: unsupported platforms, PATH states, signal handling, binary output, injection prevention |
| **Total** | **133** | |

### 9.2 Mock Files Used

Tests inject mock executables via `PATH="${BATS_TEST_DIRNAME}/mocks:${PATH}"`:

| Mock | Purpose |
|------|---------|
| `tests/mocks/apt-get` | Simulates apt-get (supports `MOCK_APT_FAIL` / `MOCK_APT_FAIL_MSG`) |
| `tests/mocks/brew` | Simulates Homebrew (supports `MOCK_BREW_FAIL` / `MOCK_BREW_FAIL_MSG`) |
| `tests/mocks/curl` | Simulates curl availability |
| `tests/mocks/git` | Simulates git availability |
| `tests/mocks/sudo` | Simulates sudo for apt-get install commands |
| `tests/mocks/xcode-select` | Simulates Xcode CLI tools installer for macOS git |

### 9.3 Test Categories

- **Platform detection**: 6 tests for Darwin/Linux/FreeBSD/Windows/empty/override
- **Tool availability**: 18 tests for fly multi-tier detection, flyctl fallback, PATH restoration, dedup
- **Shell helpers**: 13 tests for detect_shell, get_shell_config, reload_shell_config
- **Install flow**: 15 tests for brew/apt-get/xcode-select, verbose/quiet, failure, post-install verification
- **Orchestrator**: 8 tests for check_and_install, CI bypass, user accept/decline
- **Edge cases**: 57 tests for boundary conditions, special characters, permissions, signal handling, injection prevention, binary output
- **Guide display**: 8 tests for show_guide output across tools and platforms

See [docs/EDGE_CASE_HANDLING.md](../EDGE_CASE_HANDLING.md) for detailed edge case documentation with test cross-references.
