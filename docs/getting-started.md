# Getting Started

This guide walks through deploying Hermes to Fly.io using hermes-fly.

## Prerequisites

### 1. Install flyctl

flyctl is the Fly.io command-line tool. Install it with:

```bash
# macOS
brew install flyctl

# Linux
curl -L https://fly.io/install.sh | sh
```

Verify the installation:

```bash
fly version
```

### 2. Create a Fly.io Account

If you do not have a Fly.io account, create one:

```bash
fly auth signup
```

This opens a browser for account creation. Once complete, you are logged in automatically.

If you already have an account, log in:

```bash
fly auth login
```

### 3. Verify Authentication

```bash
fly auth whoami
```

This should print your email address.

## Running the Deploy Wizard

Start the deployment:

```bash
hermes-fly deploy
```

The wizard runs through the following steps.

### Step 1: Preflight Checks

The wizard verifies:

- **Platform** -- confirms you are on macOS or Linux
- **Prerequisites** -- checks that `fly`, `git`, and `curl` are installed
- **Network connectivity** -- confirms you can reach the Fly.io API
- **Authentication** -- verifies your Fly.io login

If any check fails, the wizard prints what is missing and how to fix it.

### Step 2: App Configuration

You are prompted to configure:

- **App name** -- unique Fly.io app name. Accept the random
  suggestion or type your own.
- **Region** -- Fly.io region (e.g., `ord`, `lax`). The wizard
  suggests the nearest one.
- **VM size** -- shared-cpu-1x (256 MB), shared-cpu-2x (512 MB),
  performance-1x (1 GB), or dedicated-cpu-1x (1 GB).
- **Volume size** -- persistent storage: 1 GB, 5 GB
  (recommended), or 10 GB.

### Step 3: API Key and Model

- **API key** -- your OpenRouter or provider API key. Stored
  securely via `fly secrets`, never written to disk.
- **Model** -- the LLM model identifier (e.g., `anthropic/claude-sonnet-4-20250514`).

### Step 4: Messaging (Optional)

Optionally configure notifications via Telegram or Discord.
See [Messaging Setup](messaging.md) for details.

### Step 5: Build and Deploy

The wizard:

1. Generates a Dockerfile from the project template
2. Generates a fly.toml configuration
3. Creates the Fly.io app
4. Provisions a persistent volume
5. Sets secrets (API key, model, messaging tokens)
6. Deploys the Docker image via `fly deploy`

### Step 6: Verification

After deployment, the wizard:

1. Waits for the machine to start
2. Runs a health check against the app URL
3. Displays the app URL and next steps

## Post-Deployment

### Check Status

```bash
hermes-fly status
```

Shows app state, machine status, region, and URL.

### View Logs

```bash
hermes-fly logs
```

Streams live logs from your running instance.

### Run Diagnostics

```bash
hermes-fly doctor
```

Checks authentication, app existence, machine health, volume status, and connectivity.

### Tear Down

To remove the deployment completely:

```bash
hermes-fly destroy
```

This deletes the Fly.io app, all volumes, and local configuration.

## References

- [Fly.io VM sizing documentation](https://fly.io/docs/machines/guides-examples/machine-sizing/)
