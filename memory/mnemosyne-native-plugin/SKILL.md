---
name: mnemosyne-native-plugin
description: Native Hermes plugin for persistent memory using pre_llm_call hook. Injects context like Honcho but local/SQLite.
version: 2.0
tags: [memory, plugin, native, sqlite, hermes]
---

# Mnemosyne Native Plugin

Native Hermes plugin for persistent memory that uses the `pre_llm_call` hook to inject context automatically, similar to Honcho but fully local with SQLite.

## Architecture

- **Type**: Native Hermes Plugin (not just a skill)
- **Hook**: `pre_llm_call` - injects context before each LLM call
- **Storage**: SQLite database (`~/.hermes/mnemosyne/data/`)
- **Location**: `~/.hermes/plugins/mnemosyne/`

## File Structure

```
~/.hermes/plugins/mnemosyne/
├── plugin.yaml          # Plugin manifest
├── __init__.py          # Plugin loader & pre_llm_call hook
├── tools.py             # Native tools (remember, recall, stats)
├── core.py              # SQLite operations
├── README.md            # Documentation
├── DR_STATUS.md         # Disaster Recovery status
└── health_check.sh      # Bash health check script

~/.hermes/mnemosyne/
├── data/
│   └── mnemosyne_native.db    # SQLite database
├── backups/                     # Auto-rotated backups
└── logs/                        # DR and cron logs
```

## Tools Exposed

- `mnemosyne_remember` - Store a new memory
- `mnemosyne_recall` - Search memories by query
- `mnemosyne_stats` - Get database statistics

## Disaster Recovery

Located at: `~/.hermes/skills/mnemosyne_native/`

- 5 recovery scenarios documented
- Auto-backup every 6 hours (cron)
- 4 backups available (auto-rotation)
- Health check script: `health_check.sh`

## How It Works

1. Hermes loads plugin from `~/.hermes/plugins/mnemosyne/`
2. Plugin registers `pre_llm_call` hook
3. Before each response, hook queries SQLite
4. Context injected into system prompt (silent, no visible code)
5. User sees: "# Mnemosyne Memory" in context

## Key Difference from Skills

| Aspect | Skill | Native Plugin |
|--------|-------|---------------|
| Integration | Manual call | Auto via hook |
| Visibility | Shows Python code | Silent |
| Speed | HTTP or subprocess | Direct SQLite |
| Context injection | Manual | Automatic |

## CRITICAL: Stop Using Legacy `memory` Tool

**The legacy `memory` tool is deprecated for durable storage.** Mnemosyne is now the primary and only memory system. When you need to store or recall durable facts, preferences, or user profile data, **always** use:

- `mnemosyne_remember` instead of `memory(action="add")`
- `mnemosyne_recall` instead of relying on injected `memory` blocks
- `mnemosyne_scratchpad_write` for temporary notes

If you catch yourself reaching for `memory(action="add|replace|remove")`, STOP and use Mnemosyne instead.

## Status

- 31 memories persisted
- 32KB database
- DR v2.0 operational
- Auto-backup active