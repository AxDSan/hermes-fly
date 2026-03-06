# Experimental and Future Features

This page documents stretch goals and aspirational features
that are not yet implemented. Included for transparency and
to track future development.

## Health Monitoring Endpoint

A lightweight HTTP endpoint on the deployed Hermes
instance that reports health status. This would allow
external uptime monitors (e.g., UptimeRobot, Fly.io
checks) to verify the instance is running.

**Status:** Not implemented. The deploy wizard includes
a one-time post-deploy check, but no persistent
monitoring endpoint exists yet.

## Activity and Usage Reports

Periodic reports summarizing Hermes usage: message
counts by platform, response latency, task success
rate, token consumption, and estimated cost. Reports
could be delivered daily or weekly via the configured
messaging platform.

**Possible metrics:**

- Messages sent/received per platform
- Average response time
- Token usage and estimated cost
- Active days

**Status:** Not implemented.

## Tigris Object Storage

An alternative to Fly Volumes for persistent storage.
[Tigris](https://www.tigrisdata.com/) is an
S3-compatible object store integrated with Fly.io. It
would enable stateless deployments where Hermes syncs
data to/from Tigris on startup and shutdown.

**Trade-offs vs. Fly Volumes:**

- Tigris enables horizontal scaling (volumes are tied to a single machine)
- Tigris requires additional credentials and sync logic
- Volumes are simpler and recommended for single-user deployments

**Status:** Not implemented. Fly Volumes remain the
recommended persistence strategy for beginners.

## WhatsApp Support

Integration with the WhatsApp Business API for messaging. This would require:

- Meta Business verification (2-15 business days)
- A Business Service Provider (BSP) or direct API access
- Per-message pricing (varies by category and region; ~$0.004-$0.14 per message)

**Caveats:** WhatsApp Business API has significantly
higher barriers and costs compared to Telegram (free)
and Discord (free bot tier). Not well-suited for the
personal AI assistant use case hermes-fly targets.

**Status:** Not implemented. Documented as a stretch goal.

## Slack Support

Integration with Slack workspaces for messaging. This would require:

- OAuth 2.0 setup and workspace membership
- A Slack workspace with appropriate permissions
- Slack pricing starts at $7.25/user/month for Pro (annual) or $8.75/user/month (monthly)

**Caveats:** Slack requires workspace membership and
per-user pricing, making it less practical for personal
use. Better suited for team deployments.

**Status:** Not implemented. Documented as a stretch goal.

## GitHub Actions CI/CD

A GitHub Actions workflow template for automated
deployments on push to `main`. This would use the
`FLY_API_TOKEN` secret and run `fly deploy`
automatically.

**Potential workflow:**

- Lint and test on pull request
- Auto-deploy to Fly.io on merge to `main`
- Health check after deployment

**Caveats:** Adds CI/CD complexity that may not benefit
beginners. The primary method (`hermes-fly deploy`) is
simpler for the target audience.

**Status:** Not implemented. Could be documented as an
alternative for advanced users.

## Multi-Region Deployment

Deploying Hermes across multiple Fly.io regions for
redundancy or lower latency. Fly.io supports this via
`fly scale count` with multiple regions and anycast
IP routing.

**Caveats:** Fly Volumes do not replicate across
regions. Multi-region deployments would require an
external database or LiteFS for state sync. This adds
significant complexity without clear benefit for
single-user personal assistants.

**Status:** Not implemented. Single-region with volume snapshots is recommended.

## Terraform / Pulumi Integration

Infrastructure-as-code management for Fly.io resources. Fly.io intentionally discontinued their official Terraform provider in 2024, as the declarative model was a poor fit for their platform. Community-maintained providers exist (e.g., DAlperin/fly-io) but are not officially supported.

**Status:** Not planned. Fly.io's native tooling (`flyctl`, `fly.toml`) is already optimized for managing Fly infrastructure. The `hermes-fly` CLI provides the automation layer on top.

## References

- [WhatsApp Business API approval guide](https://chatimize.com/get-approved-whatsapp/)
- [WhatsApp Business Platform pricing](https://business.whatsapp.com/products/platform-pricing)
- [Slack pricing plans](https://slack.com/pricing)
- [Fly.io infrastructure automation without Terraform](https://fly.io/docs/blueprints/infra-automation-without-terraform/)
- [Fly.io Volumes overview](https://fly.io/docs/volumes/overview/)
- [Tigris global object storage on Fly.io](https://fly.io/docs/tigris/)
- [LiteFS distributed SQLite on Fly.io](https://fly.io/docs/litefs/)
