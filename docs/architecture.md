# Architecture

System design and module structure for hermes-fly.

## Overview

hermes-fly is a Bash CLI that automates deploying
[Hermes Agent](https://github.com/NousResearch/hermes-agent)
to [Fly.io](https://fly.io). It provides a wizard for
first-time deployment and subcommands for ongoing management
(status, logs, diagnostics, teardown).

Written entirely in Bash with no compilation step.
Each command lives in a dedicated module under `lib/`,
sourced at startup by the main entry point.

## Directory Structure

```text
hermes-fly/
├── hermes-fly                # Main entry point (argument parsing, command dispatch)
├── lib/
│   ├── ui.sh                 # Colors, prompts, spinners, logging, exit codes
│   ├── config.sh             # App tracking (~/.hermes-fly/config.yaml)
│   ├── fly-helpers.sh        # Fly.io CLI wrappers + retry logic
│   ├── docker-helpers.sh     # Dockerfile and fly.toml generation from templates
│   ├── messaging.sh          # Telegram/Discord setup wizards
│   ├── deploy.sh             # Interactive deployment wizard
│   ├── status.sh             # Status command + cost estimation
│   ├── logs.sh               # Log streaming wrapper
│   ├── doctor.sh             # Diagnostic checks
│   └── destroy.sh            # Teardown (app, volumes, config cleanup)
├── templates/
│   ├── Dockerfile.template   # Dockerfile with {{HERMES_VERSION}} placeholder
│   └── fly.toml.template     # Fly config with app/region/VM/volume placeholders
├── scripts/
│   └── install.sh            # curl | bash installer
├── docs/                     # Documentation
├── README.md
└── LICENSE
```

## Module Responsibilities

### `hermes-fly` (entry point)

Sets `set -euo pipefail`, sources all `lib/*.sh` modules,
defines help text, and dispatches subcommands (`deploy`,
`status`, `logs`, `doctor`, `destroy`) via a `case`
statement. Resolves the app name via `config_resolve_app`.

### `lib/ui.sh`

Shared UI primitives used by every other module:

- **Exit code constants** -- `EXIT_SUCCESS` (0),
  `EXIT_ERROR` (1), `EXIT_AUTH` (2), `EXIT_NETWORK` (3),
  `EXIT_RESOURCE` (4)
- **Color output** -- respects `NO_COLOR` and terminal detection
- **Output functions** -- `ui_info`, `ui_success`, `ui_warn`, `ui_error`, `ui_step`
- **Prompts** -- `ui_ask`, `ui_ask_secret`, `ui_confirm`
- **Banner** -- `ui_banner` for formatted section headers
- **Selection** -- `ui_select` for numbered-choice menus
- **Logging** -- file-based logging via `log_init`, `log_info`, `log_error`

### `lib/config.sh`

Manages the local config file at `~/.hermes-fly/config.yaml`:

- `config_init` -- creates the config directory and file if missing
- `config_save_app` -- adds or updates an app entry and sets it as `current_app`
- `config_remove_app` -- removes an app entry from config
- `config_resolve_app` -- resolves app name from `-a` flag or `current_app`

### `lib/fly-helpers.sh`

Wrappers around the `fly` CLI with validation and retry logic:

- `fly_check_installed` / `fly_check_version` -- prerequisite checks
- `fly_check_auth` / `fly_check_auth_interactive` -- auth validation with retry
- `fly_create_app`, `fly_create_volume`,
  `fly_set_secrets`, `fly_deploy` -- resource creation
- `fly_destroy_app`, `fly_list_volumes` -- teardown helpers
- `fly_status`, `fly_logs` -- status and log wrappers
- Automatic retry with exponential backoff for transient failures

### `lib/docker-helpers.sh`

Generates deployment artifacts from templates:

- `docker_generate_dockerfile` -- reads
  `templates/Dockerfile.template`, substitutes
  `{{HERMES_VERSION}}`, writes `Dockerfile`
- `docker_generate_fly_toml` -- reads
  `templates/fly.toml.template`, substitutes app name,
  region, VM size, memory, volume name/size; writes
  `fly.toml`
- `docker_get_build_dir` -- returns the temporary build directory path

### `lib/messaging.sh`

Interactive setup for Telegram and Discord:

- Token validation (format checks for Telegram and Discord bot tokens)
- `messaging_setup_telegram` / `messaging_setup_discord` -- guided credential entry
- `messaging_setup_menu` -- menu for choosing a messaging platform or skipping

### `lib/deploy.sh`

The main deployment wizard, orchestrating all other modules:

- Preflight checks (platform, prerequisites, connectivity, auth)
- Interactive prompts for app name, region, VM size, volume size
- API key and model configuration
- Messaging setup (delegates to `messaging.sh`)
- Artifact generation (delegates to `docker-helpers.sh`)
- Resource creation and deployment (delegates to `fly-helpers.sh`)
- Post-deploy health check and summary

### `lib/status.sh`

- `cmd_status` -- displays app state, machine status, region, and URL
- `status_estimate_cost` -- estimates monthly cost from
  VM size and volume GB

### `lib/logs.sh`

- `cmd_logs` -- wraps `fly_logs` with error handling and UI feedback

### `lib/doctor.sh`

- `doctor_report` -- formats individual check results (pass/fail)
- `cmd_doctor` -- runs checks: app existence, machine state,
  volume health, secrets, hermes process, gateway health,
  API connectivity

### `lib/destroy.sh`

- `destroy_cleanup_volumes` -- lists and deletes all volumes for an app
- `cmd_destroy` -- confirms with user, destroys app and
  volumes, removes config entry

## Data Flow

```text
User runs: hermes-fly deploy
       │
       ▼
Preflight checks (platform, flyctl, auth, network)
       │
       ▼
Interactive prompts (app name, region, VM, volume, API key, messaging)
       │
       ▼
Generate Dockerfile from templates/Dockerfile.template
       │
       ▼
Generate fly.toml from templates/fly.toml.template
       │
       ▼
Create Fly.io app + volume (fly apps create, fly volumes create)
       │
       ▼
Set secrets via fly secrets set (API keys, tokens)
       │
       ▼
Deploy via fly deploy (builds Docker image, starts machine)
       │
       ▼
Post-deploy health check + summary output
       │
       ▼
Save app to ~/.hermes-fly/config.yaml
```

For ongoing management, users call
`hermes-fly status|logs|doctor|destroy`, each resolving
the app via `config_resolve_app` (`-a` flag first, then
`current_app` in config) and delegating to the Fly CLI.

## Template System

Deployment artifacts are generated at deploy time from templates in `templates/`:

**`Dockerfile.template`** -- A minimal Dockerfile based on
`python:3.11-slim` that installs Hermes via upstream
`install.sh`. The `{{HERMES_VERSION}}` placeholder is
replaced with a git ref (default: `main`).

**`fly.toml.template`** -- Fly.io app config with
placeholders for `{{APP_NAME}}`, `{{REGION}}`,
`{{VM_SIZE}}`, `{{VM_MEMORY}}`, `{{VOLUME_NAME}}`, and
`{{VOLUME_SIZE}}`. Mounts at `/root/.hermes`.

This approach keeps templates readable and avoids embedding large heredocs in Bash.

## Module Dependency Graph

```text
hermes-fly (entry point)
  └── sources all lib/*.sh

deploy.sh
  ├── ui.sh
  ├── fly-helpers.sh
  ├── docker-helpers.sh
  ├── messaging.sh
  ├── config.sh
  └── status.sh

destroy.sh
  ├── ui.sh
  ├── fly-helpers.sh
  └── config.sh

doctor.sh
  ├── ui.sh
  └── fly-helpers.sh

status.sh
  ├── ui.sh
  └── fly-helpers.sh

logs.sh
  ├── ui.sh
  └── fly-helpers.sh

messaging.sh
  └── ui.sh

fly-helpers.sh
  └── ui.sh

docker-helpers.sh
  └── (standalone, reads templates/)

config.sh
  └── (standalone)
```

Modules that source dependencies (e.g., `deploy.sh`,
`fly-helpers.sh`) guard against re-sourcing by checking
whether key functions or variables are already defined.
Standalone modules (`config.sh`, `docker-helpers.sh`)
only guard against direct execution.

## Security Model

- **Secrets via Fly.io** -- sensitive values (API keys,
  tokens) stored via `fly secrets set`, never on disk
- **No local secret storage** -- config file
  (`~/.hermes-fly/config.yaml`) only stores app names,
  regions, and timestamps
- **Container isolation** -- Hermes runs in a Fly Machine
  with standard isolation; gateway is the only service
- **User allowlists** -- access control (e.g.,
  `TELEGRAM_ALLOWED_USERS`) enforced by Hermes, not
  hermes-fly

For Hermes's own security model, see the [Hermes Agent documentation](https://github.com/NousResearch/hermes-agent).

## Error Handling

- **Exit codes** -- standardized: 0 (success), 1 (error),
  2 (auth), 3 (network), 4 (resource limit)
- **Fail-fast** -- `set -euo pipefail` catches unhandled
  errors immediately
- **Actionable messages** -- errors include what went
  wrong and how to fix it
- **Auto-retry** -- transient failures retried with
  exponential backoff
- **Auto-cleanup** -- partial resources cleaned up on
  deployment failure

---

## References

- [NO_COLOR standard specification](https://no-color.org/)
- [NousResearch hermes-agent repository](https://github.com/NousResearch/hermes-agent)
