# Troubleshooting

Common issues and how to resolve them.

## Deployment Failures

### "fly: command not found"

flyctl is not installed or not on your PATH.

```bash
# macOS
brew install flyctl

# Linux
curl -L https://fly.io/install.sh | sh
```

After installation, restart your terminal or run `source ~/.bashrc` (or `~/.zshrc`).

### "not logged in" or authentication errors

Log in to Fly.io:

```bash
fly auth login
```

Verify:

```bash
fly auth whoami
```

### Network connectivity failure

The wizard checks connectivity to `https://api.fly.io`. If this fails:

- Verify your internet connection.
- Check if a proxy or firewall is blocking HTTPS requests.
- Try `curl -s https://api.fly.io` manually to see the error.

### Quota or billing errors

Fly.io requires a payment method for some resources. If deployment fails with
a billing error:

1. Go to [fly.io/dashboard](https://fly.io/dashboard).
2. Add a payment method under Billing.
3. Retry the deployment.

### App name already taken

Fly.io app names are globally unique. If your chosen name is taken:

- Choose a different name when prompted by the wizard.
- The wizard suggests a random name by default; pressing Enter avoids conflicts.

## App Not Starting

### Check logs

```bash
hermes-fly logs
```

Or directly:

```bash
fly logs -a your-app-name
```

Look for errors during startup, especially around API key validation or missing
environment variables.

### Run diagnostics

```bash
hermes-fly doctor
```

This checks:

- App existence
- Machine state
- Volumes mounted
- Required secrets
- Hermes process
- Gateway health
- API connectivity

### Machine stuck in "created" state

If the machine never transitions to "started":

```bash
fly machine list -a your-app-name
fly machine start MACHINE_ID -a your-app-name
```

### OOM (out of memory) kills

If logs show the process being killed, your VM may not have enough memory:

1. Destroy the current deployment: `hermes-fly destroy`
2. Redeploy with a larger VM size (shared-cpu-2x or performance-1x).

## Volume Issues

### "volume not found" during deploy

This can happen if a previous deployment was partially cleaned up. Destroy and redeploy:

```bash
hermes-fly destroy
hermes-fly deploy
```

### Volume full

Check volume usage:

```bash
fly ssh console -a your-app-name -C "df -h"
```

If the volume is full, redeploy with a larger volume or clean up files inside
the volume:

```bash
fly ssh console -a your-app-name
# Inside the console, remove unnecessary files from /data
```

## Messaging Not Working

See the [Messaging Setup](messaging.md) guide for detailed configuration steps.

### Quick checks

**Telegram:**

- Token format: `123456789:ABCdef...` (digits, colon, alphanumeric)
- Chat ID: positive number for users, negative for groups
- Bot must be started: send `/start` to it

**Discord:**

- Bot must be invited to the server with Send Messages permission
- Channel ID must be from the correct server and channel
- Enable Developer Mode in Discord to copy channel IDs

### Updating secrets

```bash
# View current secrets (names only, not values)
fly secrets list -a your-app-name

# Set a new value
fly secrets set TELEGRAM_BOT_TOKEN="new-token" -a your-app-name
```

After updating secrets, the machine restarts automatically.

## Cost Optimization

### Use the smallest VM that works

Start with `shared-cpu-1x` (256 MB, ~$2.02/mo). Only upgrade if you see OOM
errors or performance issues.

### Use a small volume

Start with 1 GB ($0.15/mo) unless you need more storage. You can always
redeploy with a larger volume.

### Stop the machine when not in use

Fly.io charges for running machines. If you are not using Hermes continuously:

```bash
fly machine stop MACHINE_ID -a your-app-name
```

Restart it when needed:

```bash
fly machine start MACHINE_ID -a your-app-name
```

### Monitor spending

Check your usage on the [Fly.io dashboard](https://fly.io/dashboard) under Billing.

## References

- [Fly.io pricing](https://fly.io/docs/about/pricing/)
