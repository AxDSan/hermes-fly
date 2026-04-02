#!/bin/bash
set -euo pipefail
# Code symlinks (resolves Python shebang paths + ~/.local/bin node symlinks)
ln -sfn /opt/hermes/hermes-agent /root/.hermes/hermes-agent
ln -sfn /opt/hermes/node /root/.hermes/node
# All runtime data directories
mkdir -p /root/.hermes/{cron,sessions,logs,pairing,hooks,image_cache,audio_cache,memories,runtime,whatsapp/session,cli_configs}

# Persistent CLI configs — survive deploys/restarts on Fly.io
PERSISTENT_DIR="/root/.hermes/cli_configs"
mkdir -p "$PERSISTENT_DIR"

# JavaScript/TypeScript Runtimes & Package Managers
# Bun (already installed in Docker, but ensure global packages persist)
mkdir -p "$PERSISTENT_DIR/.bun"
ln -sfn "$PERSISTENT_DIR/.bun" ~/.bun 2>/dev/null || true
export BUN_INSTALL="$PERSISTENT_DIR/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

# Deno
mkdir -p "$PERSISTENT_DIR/.deno"
ln -sfn "$PERSISTENT_DIR/.deno" ~/.deno 2>/dev/null || true

# Yarn
mkdir -p "$PERSISTENT_DIR/.yarn"
ln -sfn "$PERSISTENT_DIR/.yarn" ~/.yarn 2>/dev/null || true

# pnpm
mkdir -p "$PERSISTENT_DIR/.local/share/pnpm"
ln -sfn "$PERSISTENT_DIR/.local/share/pnpm" ~/.local/share/pnpm 2>/dev/null || true
mkdir -p "$PERSISTENT_DIR/.pnpm-store"
ln -sfn "$PERSISTENT_DIR/.pnpm-store" ~/.pnpm-store 2>/dev/null || true

# uv (Python package manager)
mkdir -p "$PERSISTENT_DIR/.uv"
ln -sfn "$PERSISTENT_DIR/.uv" ~/.uv 2>/dev/null || true
export UV_INSTALL_DIR="$PERSISTENT_DIR/.uv"
export UV_CACHE_DIR="$PERSISTENT_DIR/.uv/cache"
export PATH="$UV_INSTALL_DIR/bin:$PATH"

# Deployment Platforms
# Vercel (legacy ~/.vercel and modern XDG path)
mkdir -p "$PERSISTENT_DIR/.vercel"
ln -sfn "$PERSISTENT_DIR/.vercel" ~/.vercel 2>/dev/null || true
mkdir -p "$PERSISTENT_DIR/.local/share/com.vercel.cli"
ln -sfn "$PERSISTENT_DIR/.local/share/com.vercel.cli" ~/.local/share/com.vercel.cli 2>/dev/null || true

# Railway (covers both old ~/.railway and new ~/.config/railway)
mkdir -p "$PERSISTENT_DIR/.railway"
ln -sfn "$PERSISTENT_DIR/.railway" ~/.railway 2>/dev/null || true
mkdir -p "$PERSISTENT_DIR/.config/railway"
ln -sfn "$PERSISTENT_DIR/.config/railway" ~/.config/railway 2>/dev/null || true

# Netlify
mkdir -p "$PERSISTENT_DIR/.netlify"
ln -sfn "$PERSISTENT_DIR/.netlify" ~/.netlify 2>/dev/null || true
mkdir -p "$PERSISTENT_DIR/.config/netlify"
ln -sfn "$PERSISTENT_DIR/.config/netlify" ~/.config/netlify 2>/dev/null || true

# Cloud CLIs
# AWS CLI
mkdir -p "$PERSISTENT_DIR/.aws"
ln -sfn "$PERSISTENT_DIR/.aws" ~/.aws 2>/dev/null || true

# Google Cloud SDK
mkdir -p "$PERSISTENT_DIR/.config/gcloud"
ln -sfn "$PERSISTENT_DIR/.config/gcloud" ~/.config/gcloud 2>/dev/null || true

# Azure CLI
mkdir -p "$PERSISTENT_DIR/.azure"
ln -sfn "$PERSISTENT_DIR/.azure" ~/.azure 2>/dev/null || true

# Container & Kubernetes
# Docker
mkdir -p "$PERSISTENT_DIR/.docker"
ln -sfn "$PERSISTENT_DIR/.docker" ~/.docker 2>/dev/null || true

# kubectl (kubeconfig)
mkdir -p "$PERSISTENT_DIR/.kube"
ln -sfn "$PERSISTENT_DIR/.kube" ~/.kube 2>/dev/null || true

# Helm
mkdir -p "$PERSISTENT_DIR/.config/helm"
ln -sfn "$PERSISTENT_DIR/.config/helm" ~/.config/helm 2>/dev/null || true
mkdir -p "$PERSISTENT_DIR/.cache/helm"
ln -sfn "$PERSISTENT_DIR/.cache/helm" ~/.cache/helm 2>/dev/null || true

# Infrastructure as Code
# Terraform
mkdir -p "$PERSISTENT_DIR/.terraform.d"
ln -sfn "$PERSISTENT_DIR/.terraform.d" ~/.terraform.d 2>/dev/null || true

# Pulumi
mkdir -p "$PERSISTENT_DIR/.pulumi"
ln -sfn "$PERSISTENT_DIR/.pulumi" ~/.pulumi 2>/dev/null || true

# Packer
mkdir -p "$PERSISTENT_DIR/.packer.d"
ln -sfn "$PERSISTENT_DIR/.packer.d" ~/.packer.d 2>/dev/null || true

# Version Control
# GitHub CLI
mkdir -p "$PERSISTENT_DIR/.config/gh"
ln -sfn "$PERSISTENT_DIR/.config/gh" ~/.config/gh 2>/dev/null || true

# GitLab CLI
mkdir -p "$PERSISTENT_DIR/.config/glab-cli"
ln -sfn "$PERSISTENT_DIR/.config/glab-cli" ~/.config/glab-cli 2>/dev/null || true

# Networking
# Tailscale
mkdir -p "$PERSISTENT_DIR/.tailscale"
ln -sfn "$PERSISTENT_DIR/.tailscale" ~/.tailscale 2>/dev/null || true
# Persistent Tools Directory - npm/pip packages installed here survive restarts
PERSISTENT_TOOLS_DIR="/root/.hermes/tools"
mkdir -p "$PERSISTENT_TOOLS_DIR/bin" "$PERSISTENT_TOOLS_DIR/lib" "$PERSISTENT_TOOLS_DIR/share"

# Add persistent tools to PATH
export PATH="$PERSISTENT_TOOLS_DIR/bin:$PATH"
export NPM_CONFIG_PREFIX="$PERSISTENT_TOOLS_DIR"
export PYTHONUSERBASE="$PERSISTENT_TOOLS_DIR"
export PYTHONPATH="${PYTHONPATH:+$PYTHONPATH:}$PERSISTENT_TOOLS_DIR/lib/python3.11/site-packages"

# Install tools on first boot (if .tools-installed doesn't exist)
if [[ ! -f /root/.hermes/.tools-installed ]]; then
  echo "[hermes] Installing tools to persistent volume (~/.hermes/tools)..."
  
  # Ensure npm uses persistent location
  npm config set prefix "$PERSISTENT_TOOLS_DIR" 2>/dev/null || true
  
  echo "[hermes] Tools directory ready: $PERSISTENT_TOOLS_DIR"
  echo "[hermes] To install tools that persist, use:"
  echo "[hermes]   npm install -g <package>   (installs to ~/.hermes/tools)"
  echo "[hermes]   pip install --user <pkg>   (installs to ~/.hermes/tools)"
  
  touch /root/.hermes/.tools-installed
fi

# Auto-install tools from HERMES_NPM_TOOLS, HERMES_BUN_TOOLS, HERMES_UV_TOOLS and HERMES_PIP_TOOLS env vars
# Usage: fly secrets set HERMES_NPM_TOOLS="@paperclipai/cli,http-server"
# Usage: fly secrets set HERMES_BUN_TOOLS="@paperclipai/cli,typescript"
# Usage: fly secrets set HERMES_UV_TOOLS="ruff,black,mypy"
if [[ -n "${HERMES_NPM_TOOLS:-}" ]]; then
  echo "[hermes] Auto-installing npm packages: $HERMES_NPM_TOOLS"
  IFS=',' read -ra NPM_PKGS <<< "$HERMES_NPM_TOOLS"
  for pkg in "${NPM_PKGS[@]}"; do
    pkg=$(echo "$pkg" | xargs)  # trim whitespace
    if [[ -n "$pkg" && ! -d "$PERSISTENT_TOOLS_DIR/lib/node_modules/$pkg" ]]; then
      echo "[hermes]   Installing npm: $pkg"
      npm install -g "$pkg" 2>&1 | tail -1
    fi
  done
fi

if [[ -n "${HERMES_BUN_TOOLS:-}" ]]; then
  echo "[hermes] Auto-installing Bun packages: $HERMES_BUN_TOOLS"
  IFS=',' read -ra BUN_PKGS <<< "$HERMES_BUN_TOOLS"
  for pkg in "${BUN_PKGS[@]}"; do
    pkg=$(echo "$pkg" | xargs)  # trim whitespace
    if [[ -n "$pkg" && ! -d "$PERSISTENT_DIR/.bun/install/global/$pkg" ]]; then
      echo "[hermes]   Installing bun: $pkg"
      bun install -g "$pkg" 2>&1 | tail -1
    fi
  done
fi

if [[ -n "${HERMES_UV_TOOLS:-}" ]]; then
  echo "[hermes] Auto-installing uv packages: $HERMES_UV_TOOLS"
  IFS=',' read -ra UV_PKGS <<< "$HERMES_UV_TOOLS"
  for pkg in "${UV_PKGS[@]}"; do
    pkg=$(echo "$pkg" | xargs)  # trim whitespace
    if [[ -n "$pkg" ]]; then
      uv tool list 2>/dev/null | grep -q "^$pkg " || {
        echo "[hermes]   Installing uv: $pkg"
        uv tool install "$pkg" 2>&1 | tail -1
      }
    fi
  done
fi

if [[ -n "${HERMES_PIP_TOOLS:-}" ]]; then
  echo "[hermes] Auto-installing pip packages: $HERMES_PIP_TOOLS"
  IFS=',' read -ra PIP_PKGS <<< "$HERMES_PIP_TOOLS"
  for pkg in "${PIP_PKGS[@]}"; do
    pkg=$(echo "$pkg" | xargs)  # trim whitespace
    if [[ -n "$pkg" ]]; then
      pip show "$pkg" 2>/dev/null || {
        echo "[hermes]   Installing pip: $pkg"
        pip install --user "$pkg" 2>&1 | tail -1
      }
    fi
  done
fi

# Seed default config files on first deploy (never overwrite user customizations)
for f in .env config.yaml SOUL.md; do
  if [[ ! -f /root/.hermes/$f ]] && [[ -f /opt/hermes/defaults/$f ]]; then
    cp /opt/hermes/defaults/$f /root/.hermes/$f
  fi
done
if [[ ! -d /root/.hermes/skills ]] && [[ -d /opt/hermes/defaults/skills ]]; then
  cp -r /opt/hermes/defaults/skills /root/.hermes/skills
fi
# Seed Hermes auth state on first deploy when an OAuth-backed provider is configured.
if [[ -n "${HERMES_AUTH_JSON_B64:-}" ]] && [[ ! -f /root/.hermes/auth.json ]]; then
  umask 077
  printf '%s' "${HERMES_AUTH_JSON_B64}" | base64 -d > /root/.hermes/auth.json
  chmod 600 /root/.hermes/auth.json
fi
if [[ -n "${HERMES_ANTHROPIC_OAUTH_JSON_B64:-}" ]] && [[ ! -f /root/.hermes/.anthropic_oauth.json ]]; then
  umask 077
  printf '%s' "${HERMES_ANTHROPIC_OAUTH_JSON_B64}" | base64 -d > /root/.hermes/.anthropic_oauth.json
  chmod 600 /root/.hermes/.anthropic_oauth.json
fi
# Mirror Anthropic OAuth into Claude Code's credential store so Hermes CLI
# recognizes the provider as configured before launching interactive chat.
if [[ -f /root/.hermes/.anthropic_oauth.json ]]; then
  python3 - <<'PYEOF'
import json
from pathlib import Path

source = Path('/root/.hermes/.anthropic_oauth.json')
target = Path('/root/.claude/.credentials.json')

try:
    oauth = json.loads(source.read_text(encoding='utf-8'))
except Exception:
    raise SystemExit(0)

target.parent.mkdir(parents=True, exist_ok=True)
payload = {
    'claudeAiOauth': {
        'accessToken': oauth.get('accessToken', ''),
        'refreshToken': oauth.get('refreshToken', ''),
        'expiresAt': oauth.get('expiresAt', 0),
    }
}
target.write_text(json.dumps(payload), encoding='utf-8')
target.chmod(0o600)
PYEOF
fi
# Stage WhatsApp gateway config until the first pairing completes. This avoids
# racing the live gateway against `hermes whatsapp` during deploy-time setup.
if [[ -z "${WHATSAPP_ENABLED:-}" ]] && [[ "${HERMES_FLY_WHATSAPP_PENDING:-}" =~ ^(1|true|yes)$ ]]; then
  if find /root/.hermes/whatsapp/session -mindepth 1 -print -quit 2>/dev/null | grep -q .; then
    export WHATSAPP_ENABLED=true
    if [[ -n "${HERMES_FLY_WHATSAPP_MODE:-}" ]]; then
      export WHATSAPP_MODE="${HERMES_FLY_WHATSAPP_MODE}"
    fi
    if [[ -n "${HERMES_FLY_WHATSAPP_ALLOWED_USERS:-}" ]]; then
      export WHATSAPP_ALLOWED_USERS="${HERMES_FLY_WHATSAPP_ALLOWED_USERS}"
    fi
  else
    sed -i '/^WHATSAPP_ENABLED=/d' /root/.hermes/.env 2>/dev/null || true
    sed -i '/^WHATSAPP_MODE=/d' /root/.hermes/.env 2>/dev/null || true
    sed -i '/^WHATSAPP_ALLOWED_USERS=/d' /root/.hermes/.env 2>/dev/null || true
    sed -i '/^WHATSAPP_HOME_CHANNEL=/d' /root/.hermes/.env 2>/dev/null || true
    sed -i '/^WHATSAPP_HOME_CONTACT=/d' /root/.hermes/.env 2>/dev/null || true
  fi
fi
if [[ -z "${WHATSAPP_ENABLED:-}" ]]; then
  sed -i '/^WHATSAPP_ENABLED=/d' /root/.hermes/.env 2>/dev/null || true
fi
if [[ -z "${WHATSAPP_MODE:-}" ]]; then
  sed -i '/^WHATSAPP_MODE=/d' /root/.hermes/.env 2>/dev/null || true
fi
if [[ -z "${WHATSAPP_ALLOWED_USERS:-}" ]]; then
  sed -i '/^WHATSAPP_ALLOWED_USERS=/d' /root/.hermes/.env 2>/dev/null || true
fi
if [[ -z "${WHATSAPP_HOME_CHANNEL:-}" ]]; then
  sed -i '/^WHATSAPP_HOME_CHANNEL=/d' /root/.hermes/.env 2>/dev/null || true
fi
if [[ -z "${WHATSAPP_HOME_CONTACT:-}" ]]; then
  sed -i '/^WHATSAPP_HOME_CONTACT=/d' /root/.hermes/.env 2>/dev/null || true
fi
# Load the detected WhatsApp self-chat identity from the volume so future boots
# do not depend on a staged Fly secret for the adopted number.
if [[ -f /root/.hermes/whatsapp/self-chat-identity.json ]]; then
  eval "$(
    python3 - <<'PYEOF'
import json
import shlex
from pathlib import Path

state_path = Path('/root/.hermes/whatsapp/self-chat-identity.json')
try:
    state = json.loads(state_path.read_text(encoding='utf-8'))
except Exception:
    raise SystemExit(0)

mapping = {
    'HERMES_FLY_WHATSAPP_SELF_CHAT_NUMBER': str(state.get('self_number', '')).strip(),
    'HERMES_FLY_WHATSAPP_SELF_CHAT_JID': str(state.get('self_jid', '')).strip(),
    'HERMES_FLY_WHATSAPP_SELF_CHAT_LID': str(state.get('self_lid', '')).strip(),
}
for key, value in mapping.items():
    if value:
        print(f"export {key}={shlex.quote(value)}")
PYEOF
  )"
fi
if [[ -n "${HERMES_FLY_WHATSAPP_SELF_CHAT_NUMBER:-}" ]]; then
  export WHATSAPP_ENABLED=true
  export WHATSAPP_MODE="${WHATSAPP_MODE:-self-chat}"
  export WHATSAPP_ALLOWED_USERS="${HERMES_FLY_WHATSAPP_SELF_CHAT_NUMBER}"
  export WHATSAPP_HOME_CHANNEL="${HERMES_FLY_WHATSAPP_SELF_CHAT_NUMBER}"
  export WHATSAPP_HOME_CONTACT="${HERMES_FLY_WHATSAPP_SELF_CHAT_NUMBER}"
fi
# Bridge Fly secrets into /root/.hermes/.env on every boot (not just first deploy)
for var in OPENROUTER_API_KEY GLM_API_KEY GLM_BASE_URL LLM_MODEL LLM_BASE_URL LLM_API_KEY NOUS_API_KEY \
  HERMES_ZAI_THINKING \
  HERMES_REASONING_EFFORT \
  HERMES_STT_PROVIDER HERMES_STT_MODEL \
  TELEGRAM_BOT_TOKEN TELEGRAM_ALLOWED_USERS DISCORD_BOT_TOKEN DISCORD_ALLOWED_USERS \
  SLACK_BOT_TOKEN SLACK_APP_TOKEN SLACK_ALLOWED_USERS \
  WHATSAPP_ENABLED WHATSAPP_MODE WHATSAPP_ALLOWED_USERS WHATSAPP_HOME_CHANNEL WHATSAPP_HOME_CONTACT \
  HERMES_APP_NAME GATEWAY_ALLOW_ALL_USERS TELEGRAM_HOME_CHANNEL \
  HERMES_NPM_TOOLS HERMES_BUN_TOOLS HERMES_UV_TOOLS HERMES_PIP_TOOLS; do
  val="${!var:-}"
  if [[ -n "$val" ]]; then
    sed -i "/^${var}=/d" /root/.hermes/.env
    printf '%s=%s\n' "$var" "$val" >>/root/.hermes/.env
  fi
done

# Ensure persistent tools PATH is in .env for interactive shells
if ! grep -q "PATH.*\.hermes/tools/bin" /root/.hermes/.env 2>/dev/null; then
  echo "export PATH=\"/root/.hermes/tools/bin:/root/.hermes/cli_configs/.bun/bin:/root/.hermes/cli_configs/.uv/bin:\$PATH\"" >>/root/.hermes/.env
  echo "export NPM_CONFIG_PREFIX=\"/root/.hermes/tools\"" >>/root/.hermes/.env
  echo "export BUN_INSTALL=\"/root/.hermes/cli_configs/.bun\"" >>/root/.hermes/.env
  echo "export UV_INSTALL_DIR=\"/root/.hermes/cli_configs/.uv\"" >>/root/.hermes/.env
  echo "export UV_CACHE_DIR=\"/root/.hermes/cli_configs/.uv/cache\"" >>/root/.hermes/.env
  echo "export PYTHONUSERBASE=\"/root/.hermes/tools\"" >>/root/.hermes/.env
fi
# Auto-configure Telegram bot description on boot (never block startup)
if [[ -n "${TELEGRAM_BOT_TOKEN:-}" ]]; then
  (
    _app="${HERMES_APP_NAME:-hermes}"
    _desired_desc="Hermes AI Agent (${_app}) — Your AI assistant powered by Hermes on Fly.io"
    _desired_short="${_app} — Hermes AI Agent"
    # Fetch current long description
    _current_desc="$(curl -sf --max-time 5 \
      "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMyDescription" 2>/dev/null \
      | sed -n 's/.*"description"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
    # Fetch current short description independently
    _current_short="$(curl -sf --max-time 5 \
      "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMyShortDescription" 2>/dev/null \
      | sed -n 's/.*"short_description"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
    # Reconcile long description
    if [[ "$_current_desc" != "$_desired_desc" ]]; then
      if ! curl -sf --max-time 5 \
        "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setMyDescription" \
        --data-urlencode "description=${_desired_desc}" >/dev/null 2>&1; then
        echo "[hermes] Warning: failed to update bot description" >&2
      fi
    fi
    # Reconcile short description independently
    if [[ "$_current_short" != "$_desired_short" ]]; then
      if ! curl -sf --max-time 5 \
        "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setMyShortDescription" \
        --data-urlencode "short_description=${_desired_short}" >/dev/null 2>&1; then
        echo "[hermes] Warning: failed to update bot short description" >&2
      fi
    fi
  ) || true
fi
# Patch config.yaml model settings from deploy secrets on every boot.
python3 - <<'PYEOF'
import os
from pathlib import Path

config_path = Path('/root/.hermes/config.yaml')
if not config_path.exists():
    raise SystemExit(0)

lines = config_path.read_text(encoding='utf-8').splitlines()
model_default = os.environ.get('LLM_MODEL', '').strip()
model_provider = os.environ.get('HERMES_LLM_PROVIDER', '').strip()
stt_provider = os.environ.get('HERMES_STT_PROVIDER', '').strip()
stt_model = os.environ.get('HERMES_STT_MODEL', '').strip()

if not model_default and not model_provider and not stt_provider and not stt_model:
    raise SystemExit(0)

def upsert(section_lines, key, value, indent='  '):
    if not value:
        return section_lines
    rendered = []
    updated = False
    for line in section_lines:
        if line.startswith(f'{indent}{key}:'):
            rendered.append(f'{indent}{key}: "{value}"')
            updated = True
        else:
            rendered.append(line)
    if not updated:
        rendered.append(f'{indent}{key}: "{value}"')
    return rendered

def upsert_top_level_section(lines, section_name, values):
    if not any(values.values()):
        return lines

    section_index = next((i for i, line in enumerate(lines) if line.strip() == f'{section_name}:'), None)
    if section_index is None:
        if lines and lines[-1].strip():
            lines = lines + ['']
        lines = lines + [f'{section_name}:']
        section_index = len(lines) - 1

    section_start = section_index + 1
    section_end = section_start
    while section_end < len(lines):
        line = lines[section_end]
        if line and not line.startswith(' '):
            break
        section_end += 1

    section = lines[section_start:section_end]
    for key, value in values.items():
        section = upsert(section, key, value)
    return lines[:section_start] + section + lines[section_end:]

lines = upsert_top_level_section(lines, 'model', {
    'default': model_default,
    'provider': model_provider,
})
lines = upsert_top_level_section(lines, 'stt', {
    'provider': stt_provider,
    'model': stt_model,
})
config_path.write_text('\n'.join(lines) + '\n', encoding='utf-8')
PYEOF
# Clear rate limit entries for already-approved users on every boot
if [[ -f /root/.hermes/pairing/_rate_limits.json ]]; then
  python3 - <<'PYEOF'
import json, os, glob
rate_file = '/root/.hermes/pairing/_rate_limits.json'
approved_ids = set()
for af in glob.glob('/root/.hermes/pairing/*-approved.json'):
    platform = os.path.basename(af).replace('-approved.json', '')
    try:
        data = json.load(open(af))
        for uid in data.keys():
            approved_ids.add(f'{platform}:{uid}')
    except Exception:
        pass
try:
    limits = json.load(open(rate_file))
    cleaned = {k: v for k, v in limits.items() if k not in approved_ids}
    if cleaned != limits:
        json.dump(cleaned, open(rate_file, 'w'))
except Exception:
    pass
PYEOF
fi
# Pre-seed Telegram approved users on first boot only (skip pairing prompt for configured users)
if [[ -n "${TELEGRAM_ALLOWED_USERS:-}" ]] \
  && [[ ! -f /root/.hermes/pairing/telegram-approved.json ]]; then
  python3 - <<'PYEOF'
import json, os, time
approved_file = '/root/.hermes/pairing/telegram-approved.json'
users_raw = os.environ.get('TELEGRAM_ALLOWED_USERS', '')
entries = {}
for uid in users_raw.split(','):
    uid = uid.strip()
    if uid.isdigit():
        entries[uid] = {"user_name": "auto-approved", "approved_at": time.time()}
if entries:
    os.makedirs('/root/.hermes/pairing', exist_ok=True)
    json.dump(entries, open(approved_file, 'w'))
PYEOF
fi
# Pre-seed WhatsApp self-chat approvals from the detected paired identity. This
# removes the post-pair race where Hermes can see the first self-chat message
# before approvals exist.
if [[ -f /root/.hermes/whatsapp/self-chat-identity.json ]]; then
  python3 - <<'PYEOF'
import json
import os
import time
from pathlib import Path

state_path = Path('/root/.hermes/whatsapp/self-chat-identity.json')
approved_path = Path('/root/.hermes/pairing/whatsapp-approved.json')
try:
    state = json.loads(state_path.read_text(encoding='utf-8'))
except Exception:
    raise SystemExit(0)

approved_ids = []
for key in ('self_lid', 'self_jid', 'self_number'):
    value = str(state.get(key, '')).strip()
    if value and value not in approved_ids:
        approved_ids.append(value)

if not approved_ids:
    raise SystemExit(0)

existing = {}
if approved_path.exists():
    try:
        existing = json.loads(approved_path.read_text(encoding='utf-8'))
    except Exception:
        existing = {}

now = time.time()
for user_id in approved_ids:
    existing.setdefault(user_id, {
        'user_name': 'auto-approved',
        'approved_at': now,
    })

approved_path.parent.mkdir(parents=True, exist_ok=True)
tmp_path = approved_path.with_suffix('.json.tmp')
tmp_path.write_text(json.dumps(existing), encoding='utf-8')
os.chmod(tmp_path, 0o600)
os.replace(tmp_path, approved_path)
PYEOF
fi
# Write deploy provenance manifest on every boot (idempotent — latest config always wins)
python3 - <<'PYEOF'
import os, json
from datetime import datetime, timezone
_manifest = {
    'hermes_fly_version': os.environ.get('HERMES_FLY_VERSION', ''),
    'hermes_agent_ref': os.environ.get('HERMES_AGENT_REF', ''),
    'deploy_channel': os.environ.get('HERMES_DEPLOY_CHANNEL', 'stable'),
    'compatibility_policy_version': os.environ.get('HERMES_COMPAT_POLICY', ''),
    'reasoning_effort': os.environ.get('HERMES_REASONING_EFFORT', ''),
    'llm_provider': os.environ.get('HERMES_LLM_PROVIDER', ''),
    'llm_model': os.environ.get('LLM_MODEL', ''),
    'preinstalled_tools': os.environ.get('HERMES_PREINSTALLED_TOOLS', ''),
    'written_at': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
}
with open('/root/.hermes/deploy-manifest.json', 'w') as _fh:
    json.dump(_manifest, _fh, indent=2)
PYEOF

# Start Tailscale daemon if installed and configured
if command -v tailscaled >/dev/null 2>&1; then
  # Ensure /dev/net/tun exists (create if not present)
  if [[ ! -e /dev/net/tun ]]; then
    mkdir -p /dev/net 2>/dev/null || true
    mknod /dev/net/tun c 10 200 2>/dev/null || true
    chmod 0660 /dev/net/tun 2>/dev/null || true
  fi

  # Create tailscaled socket directory
  mkdir -p /var/run/tailscale

  # Start tailscaled in background
  echo "[hermes] Starting Tailscale daemon..."
  tailscaled --state=/root/.hermes/.tailscale/tailscaled.state --socket=/var/run/tailscale/tailscaled.sock &

  # Wait for tailscaled to be ready
  sleep 2

  # Auto-connect if TAILSCALE_AUTH_KEY is provided
  if [[ -n "${TAILSCALE_AUTH_KEY:-}" ]]; then
    echo "[hermes] Connecting to Tailscale..."
    tailscale up --authkey="${TAILSCALE_AUTH_KEY}" --hostname="${HERMES_APP_NAME:-hermes}" 2>/dev/null || true
  fi
fi

# Start Hermes gateway under a lightweight supervisor so deploy-time setup can
# restart the gateway process without forcing a full Fly machine reboot.
exec /gateway-supervisor.sh "$@"
