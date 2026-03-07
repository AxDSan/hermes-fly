#!/bin/bash
set -euo pipefail
# Code symlinks (resolves Python shebang paths + ~/.local/bin node symlinks)
ln -sfn /opt/hermes/hermes-agent /root/.hermes/hermes-agent
ln -sfn /opt/hermes/node /root/.hermes/node
# All runtime data directories
mkdir -p /root/.hermes/{cron,sessions,logs,pairing,hooks,image_cache,audio_cache,memories,whatsapp/session}
# Seed default config files on first deploy (never overwrite user customizations)
for f in .env config.yaml SOUL.md; do
  if [[ ! -f /root/.hermes/$f ]] && [[ -f /opt/hermes/defaults/$f ]]; then
    cp /opt/hermes/defaults/$f /root/.hermes/$f
  fi
done
if [[ ! -d /root/.hermes/skills ]] && [[ -d /opt/hermes/defaults/skills ]]; then
  cp -r /opt/hermes/defaults/skills /root/.hermes/skills
fi
# Start hermes gateway
exec /opt/hermes/hermes-agent/venv/bin/hermes gateway "$@"
