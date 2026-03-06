# Configuration

Config file format, environment variables, and secret management for hermes-fly.

## Config File

### Location

```text
~/.hermes-fly/config.yaml
```

Override the config directory by setting `HERMES_FLY_CONFIG_DIR`:

```bash
export HERMES_FLY_CONFIG_DIR=/path/to/custom/dir
```

The config file and directory are created automatically on first deployment.

### Format

```yaml
current_app: hermes-johndoe-123
apps:
  - name: hermes-johndoe-123
    region: ord
    deployed_at: 2024-01-15T10:30:00Z
  - name: hermes-work-456
    region: lax
    deployed_at: 2024-02-20T14:00:00Z
```

### Fields

| Field | Description |
| ----- | ----------- |
| `current_app` | The default app name used when `-a` is not specified |
| `apps[].name` | Fly.io app name |
| `apps[].region` | Fly.io region code (e.g., `ord`, `lax`, `ams`) |
| `apps[].deployed_at` | ISO 8601 timestamp of the last deployment |

The config file stores only non-sensitive metadata.
Secrets are managed via `fly secrets` (see below).

## App Name Resolution

When you run a command like `hermes-fly status`,
the app name is resolved in this order:

1. **`-a` flag** -- explicit app name on the command line
2. **`current_app`** -- from `~/.hermes-fly/config.yaml`
3. **Error** -- if neither is available, the command exits with an error

Examples:

```bash
# Uses -a flag (highest priority)
hermes-fly status -a hermes-work-456

# Uses current_app from config
hermes-fly status

# Override for a one-off command without changing config
hermes-fly logs -a hermes-johndoe-123
```

## Multiple Apps

hermes-fly supports tracking multiple deployments.
Each `hermes-fly deploy` run adds an app entry
and sets it as `current_app`. Switch apps with
`-a` or edit the config file directly.

## Secret Management

All sensitive values are stored via Fly.io's
encrypted secret storage, never written to disk.

### Secrets Set During Deployment

| Secret | Description | Required |
| ------ | ----------- | -------- |
| `OPENROUTER_API_KEY` | LLM provider API key | Yes |
| `LLM_MODEL` | LLM model identifier (OpenRouter) | Yes |
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather | Telegram |
| `TELEGRAM_ALLOWED_USERS` | Allowed Telegram user IDs (comma-separated) | Telegram |
| `DISCORD_BOT_TOKEN` | Bot token from Developer Portal | Discord |
| `DISCORD_ALLOWED_USERS` | Allowed Discord user IDs (comma-separated) | Discord |

### Viewing Secrets

List secret names (values are never shown):

```bash
fly secrets list -a your-app-name
```

### Updating Secrets

```bash
fly secrets set OPENROUTER_API_KEY="new-key" -a your-app-name
```

The machine restarts automatically after a secret update.

### Removing Secrets

```bash
fly secrets unset TELEGRAM_BOT_TOKEN -a your-app-name
```

For detailed messaging setup instructions, see [Messaging Setup](messaging.md).

## Environment Variables

| Variable | Description | Default |
| -------- | ----------- | ------- |
| `HERMES_FLY_CONFIG_DIR` | Override config directory | `~/.hermes-fly` |
| `HERMES_FLY_PLATFORM` | Override platform detection | auto-detected |
| `NO_COLOR` | Set to `1` to disable colored output | unset |

## Exit Codes

All hermes-fly commands use standardized exit codes:

| Code | Meaning |
| ---- | ------- |
| 0 | Success |
| 1 | General error |
| 2 | Authentication failure |
| 3 | Network/connectivity error |
| 4 | Resource limit exceeded |

---

## References

- [Fly.io Secrets Documentation](https://fly.io/docs/apps/secrets/)
