# Deploy Wizard UX Improvements

Overhaul the interactive deploy wizard for a non-technical audience. All changes implemented in a single pass.

---

## 1. Organization Selection

This selection should explain better what's happening and why, assume non-technical users will see it. Add 2-3 sentences explaining that organizations are billing/workspace groups on Fly.io, and which one to pick. Include a link to the Fly.io dashboard (<https://fly.io/dashboard>) so users can verify their orgs. Most non-technical users will have a single org (auto-selected silently) so this mainly affects multi-org accounts.

**Current output:**

```
Select organization:
  ┌───┬──────────────────────┬──────────────────┐
  │ # │ Organization         │ Slug             │
  ├───┼──────────────────────┼──────────────────┤
  │ 1 │ ai-garden-srls       │ ai-garden-srls   │
  │ 2 │ Alex Fazio           │ personal         │
  │ 3 │ synths67             │ synths67         │
  └───┴──────────────────────┴──────────────────┘
Choice [1]:
```

**Updated output:**

```
Your Fly.io account has multiple workspaces (organizations).
Each one has its own billing and apps. Pick the one you want
to deploy to. You can see your workspaces at https://fly.io/dashboard

> **Official docs**: `fly orgs list --json` returns an array of org objects with `name` (display name), `slug` (identifier), and `type` fields. Already wrapped as `fly_get_orgs()` in `lib/fly-helpers.sh:196`. Source: https://fly.io/docs/flyctl/orgs-list/

  ┌───┬──────────────────────┬──────────────────┐
  │ # │ Workspace            │ ID               │
  ├───┼──────────────────────┼──────────────────┤
  │ 1 │ ai-garden-srls       │ ai-garden-srls   │
  │ 2 │ Alex Fazio           │ personal         │
  │ 3 │ synths67             │ synths67         │
  └───┴──────────────────────┴──────────────────┘
Choose a workspace [1]:
```

### Affected modules

- **`lib/deploy.sh:deploy_collect_org()`** (line 284) — Renders the org selection table and reads user choice. Update table headers ("Organization" → "Workspace", "Slug" → "ID"), add guidance text before the table, handle auto-selection silently when only one org exists.
- **`lib/fly-helpers.sh:fly_get_orgs()`** (line 196) — Wraps `fly orgs list --json`. No changes needed; the JSON already provides `name` and `slug` fields used by `deploy_collect_org()`.
- **`lib/ui.sh`** — No changes needed. Existing `ui_select()` and printf-based table rendering are sufficient.

---

## 2. App Name

Keep the current `hermes-{username}-{NNN}` format. It's short, identifiable, collision-resistant, and meets Fly.io naming constraints (lowercase, starts with letter, 2-63 chars). Rename the prompt label from "App name" to "Agent name" — friendlier for non-technical users and consistent with what the tool actually deploys (an agent, not an "app").

> **Official docs**: `fly apps create <app name> [flags]` — flags: `--name`, `--org`, `--json`, `--generate-name`, `--network`, `--save`, `-y/--yes`. App names must be globally unique across all of Fly.io. Names follow DNS label conventions (RFC 1035) with Fly.io-specific constraints: lowercase alphanumeric and hyphens, 2-63 chars, must start with a letter and end with a letter or digit. Already implemented as `fly_create_app()` in `lib/fly-helpers.sh:102` using `fly apps create "$name" --org "$org" --json`. Source: https://fly.io/docs/flyctl/apps-create/

**Current output:**

```
App name [hermes-alex-521]:
```

**Updated output:**

```
Each deployment needs a unique name on Fly.io.
This won't be visible to anyone chatting with your agent.

Suggested: hermes-alex-521
Press Enter to use it, or type your own.

Deployment name [hermes-alex-521]:
```

### Changes

- Rename label from "App name" to "Deployment name" throughout the wizard. This clearly distinguishes it from the Telegram bot name and bot username that come later in the flow. "Deployment" signals infrastructure, not identity.
- Add guidance text explaining the name is a Fly.io identifier, not visible to end users — prevents confusion with the Telegram bot name/username (which BotFather asks for separately).
- Show the suggested name on its own line before the prompt.
- Explicitly tell the user they can press Enter to accept it, since the `[default]` bracket convention is not obvious to non-technical users.
- Keep the existing validation flow (format check, availability check via `fly_create_app`).

### Affected modules

- **`lib/deploy.sh:deploy_collect_app_name()`** (line 222) — Renders the app name prompt and reads user input. Rename prompt label from "App name" to "Deployment name", add guidance text ("Each deployment needs a unique name..."), show suggested name on its own line before the prompt.
- **`lib/deploy.sh:deploy_generate_app_name()`** (line 193) — Generates the `hermes-{username}-{NNN}` default. No changes needed; the format is kept as-is.
- **`lib/deploy.sh:deploy_validate_app_name()`** (line 205) — Validates name against DNS label rules. No changes needed.
- **`lib/fly-helpers.sh:fly_create_app()`** (line 102) — Wraps `fly apps create`. No changes needed; called by deploy_collect_app_name for availability check.

---

## 3. Region Selection

This menu should be more intuitive. Use a **two-step selection**: first show a continent/area list (Americas, Europe, Asia-Pacific, etc.), then when the user picks one, show only the cities within that continent. Add guidance text for non-technical users, e.g. "Pick the area closest to where you are for the best performance."

```
Select a region:
  ┌────┬──────────────────────────────────┬──────┐
  │ #  │ Location                         │ Code │
  ├────┼──────────────────────────────────┼──────┤
  │    │ Americas                         │      │
  │  1 │  Ashburn, Virginia (US)          │ iad  │
  │  2 │  Chicago, Illinois (US)          │ ord  │
  │  3 │  Dallas, Texas (US)              │ dfw  │
  │  4 │  Los Angeles, California (US)    │ lax  │
  │  5 │  San Jose, California (US)       │ sjc  │
  │  6 │  Secaucus, NJ (US)               │ ewr  │
  │  7 │  Toronto, Canada                 │ yyz  │
  ├────┼──────────────────────────────────┼──────┤
  │    │ Europe                           │      │
  │  8 │  Amsterdam, Netherlands          │ ams  │
  │  9 │  Frankfurt, Germany              │ fra  │
  │ 10 │  London, United Kingdom          │ lhr  │
  │ 11 │  Paris, France                   │ cdg  │
  │ 12 │  Stockholm, Sweden               │ arn  │
  ├────┼──────────────────────────────────┼──────┤
  │    │ Asia-Pacific                     │      │
  │ 13 │  Mumbai, India                   │ bom  │
  │ 14 │  Singapore, Singapore            │ sin  │
  │ 15 │  Tokyo, Japan                    │ nrt  │
  ├────┼──────────────────────────────────┼──────┤
  │    │ Oceania                          │      │
  │ 16 │  Sydney, Australia               │ syd  │
  ├────┼──────────────────────────────────┼──────┤
  │    │ South America                    │      │
  │ 17 │  Sao Paulo, Brazil               │ gru  │
  ├────┼──────────────────────────────────┼──────┤
  │    │ Africa                           │      │
  │ 18 │  Johannesburg, South Africa      │ jnb  │
  └────┴──────────────────────────────────┴──────┘
Choice [1]:
```

### Updated output

**Step 1 — Pick an area:**

```
Where are you (or your users) located?
A closer server means faster responses.

  ┌───┬─────────────────┬───────────────┐
  │ # │ Area            │ Locations     │
  ├───┼─────────────────┼───────────────┤
  │ 1 │ Americas        │ 7 locations   │
  │ 2 │ Europe          │ 5 locations   │
  │ 3 │ Asia-Pacific    │ 3 locations   │
  │ 4 │ Oceania         │ 1 location    │
  │ 5 │ South America   │ 1 location    │
  │ 6 │ Africa          │ 1 location    │
  └───┴─────────────────┴───────────────┘
Choose an area [1]:
```

**Step 2 — Pick a city (after selecting Americas):**

```
Select a location in Americas:

  ┌───┬──────────────────────────────────┬──────┐
  │ # │ Location                         │ Code │
  ├───┼──────────────────────────────────┼──────┤
  │ 1 │ Ashburn, Virginia (US)           │ iad  │
  │ 2 │ Chicago, Illinois (US)           │ ord  │
  │ 3 │ Dallas, Texas (US)               │ dfw  │
  │ 4 │ Los Angeles, California (US)     │ lax  │
  │ 5 │ San Jose, California (US)        │ sjc  │
  │ 6 │ Secaucus, NJ (US)                │ ewr  │
  │ 7 │ Toronto, Canada                  │ yyz  │
  └───┴──────────────────────────────────┴──────┘
Choose a location [1]:
```

### Implementation detail

- Step 1: Show continent list with count of available locations.
- Step 2: Show only the cities in the selected continent.
- Guidance text at the top of step 1 explains why proximity matters.
- Regions are fetched dynamically from `fly platform regions --json` with the existing static fallback.

### Affected modules

- **`lib/deploy.sh:deploy_collect_region()`** (line 376) — Currently renders a flat region list. Rewrite to a two-step flow: first show continent/area picker, then show cities within the selected area. Add continent-to-region mapping (client-side, since the API returns no continent data). Add guidance text at the top of step 1.
- **`lib/fly-helpers.sh:fly_get_regions()`** (line 182) — Wraps `fly platform regions --json`. No changes needed; the JSON already provides `Code` and `Name` fields. The continent grouping is purely a presentation concern in `deploy_collect_region()`.

> **Official docs**: `fly platform regions --json` returns an array of region objects with `Code` and `Name` fields. 18 regions across 6 continents: Americas (iad, ord, dfw, lax, sjc, ewr, yyz), Europe (ams, arn, cdg, fra, lhr), Asia-Pacific (bom, nrt, sin), Oceania (syd), South America (gru), Africa (jnb). 16/18 have gateway support (gru, jnb do not). Geographic grouping must be done client-side as the API does not return continent data. Already wrapped as `fly_get_regions()` in `lib/fly-helpers.sh:182`. Source: https://fly.io/docs/reference/regions/

#### Review amendment (2026-03-08): dynamic-region safety

- Treat the "18 regions / 6 continents" list above as an **example snapshot**, not a hardcoded truth.
- Step 1 area counts must always be computed from the live `fly_get_regions()` response.
- Keep an explicit **Other** bucket for unknown/new region codes so newly-added Fly regions remain selectable without code changes.
- If a selected area has zero mapped cities (stale mapping), re-prompt area selection instead of failing.

---

## 4. VM Size Selection

Use **tier names** instead of raw technical names, but still show the specs. Prices are purely indicative — add a disclaimer and link to <https://fly.io/calculator> for current rates. Add practical, non-technical guidance for each tier.

```
Select VM size:
  ┌───┬─────────────────────┬───────┬───────────┬──────────────────────────┐
  │ # │ VM Size             │ RAM   │ Cost      │ Use Case                 │
  ├───┼─────────────────────┼───────┼───────────┼──────────────────────────┤
  │ 1 │ shared-cpu-1x       │ 256mb │ $1.94/mo  │ lightweight testing      │
  │ 2 │ shared-cpu-2x       │ 512mb │ $3.88/mo  │ recommended for most use │
  │ 3 │ performance-1x      │ 2gb   │ $32.19/mo │ multi-tool agents        │
  │ 4 │ dedicated-cpu-1x    │ 1gb   │ $23.00/mo │ sustained workloads      │
  └───┴─────────────────────┴───────┴───────────┴──────────────────────────┘
Choice [2]: 2
```

### Updated output

```
How powerful should your agent's server be?

  ┌───┬──────────┬────────────────────────┬──────────┬──────────────────────────────────────────────┐
  │ # │ Tier     │ Specs                  │ Est.Cost │ Best for                                     │
  ├───┼──────────┼────────────────────────┼──────────┼──────────────────────────────────────────────┤
  │ 1 │ Starter  │ shared-cpu-1x, 256 MB  │ ~$2/mo   │ Trying it out. May be slow under heavy use.  │
  │ 2 │ Standard │ shared-cpu-2x, 512 MB  │ ~$4/mo   │ Most users. Handles everyday use well.        │
  │ 3 │ Pro      │ performance-1x, 2 GB   │ ~$32/mo  │ Heavy or multi-tool use. Faster under load.   │
  │ 4 │ Power    │ performance-2x, 4 GB   │ ~$64/mo  │ Heavy sustained workloads. Dedicated cores.    │

> **Official docs**: Fly.io pricing (base region iad): shared-cpu-1x/256MB = $2.02/mo, shared-cpu-2x/512MB = $4.04/mo, performance-1x/2GB = $32.19/mo. Shared CPU: min 256MB, max 2GB per core (multiples of 256MB). Performance CPU: min 2048MB, max 8GB per core (multiples of 2048MB). Note: performance-1x minimum RAM is 2GB, not 1GB. Prices vary by region. 40% discount available with reservations. VM sizes available via `fly platform vm-sizes --json` (wrapped as `fly_get_vm_sizes()` in `lib/fly-helpers.sh:189`). Source: https://fly.io/docs/about/pricing/
  └───┴──────────┴────────────────────────┴──────────┴──────────────────────────────────────────────┘

  Prices are estimates. Check current rates: https://fly.io/calculator

Choose a tier [2]:
```

#### Review amendment (2026-03-08): tier compatibility guardrails

- Do not assume `performance-2x` is always available. Render only tiers that exist in `fly platform vm-sizes --json` for the active account/context.
- If a tier's preferred backing size is unavailable, either:
  - hide that tier, or
  - map it to a documented fallback size and label it as fallback in the table.
- Always keep at least one safe shared tier selectable (`shared-cpu-1x` or `shared-cpu-2x`) to avoid dead-end menus.

### Affected modules

- **`lib/deploy.sh:deploy_collect_vm_size()`** (line 543) — Renders the VM size table and reads user choice. Replace raw VM names with tier labels (Starter/Standard/Pro/Power), add "Best for" column with non-technical guidance, add pricing disclaimer footer, add guidance question at top ("How powerful should your agent's server be?").
- **`lib/fly-helpers.sh:fly_get_vm_sizes()`** (line 189) — Wraps `fly platform vm-sizes --json`. No changes needed; the tier mapping is a presentation concern in `deploy_collect_vm_size()`.

---

## 5. Volume Size Selection

Similar tier-style guidance as VM size. Add practical explanations for what "volume" means to a non-technical user (persistent storage for your agent's memory, conversations, and files).

```
Select volume size:
  ┌───┬──────┬──────────────┬───────────┐
  │ # │ Size │ Use Case     │ Cost      │
  ├───┼──────┼──────────────┼───────────┤
  │ 1 │  1 GB │ light usage  │ $0.15/mo  │
  │ 2 │  5 GB │ recommended  │ $0.75/mo  │
  │ 3 │ 10 GB │ heavy usage  │ $1.50/mo  │
  └───┴──────┴──────────────┴───────────┘
Choice [2]:
```

### Updated output

```
How much storage should your agent have?
This is where your agent saves conversations, memories, and files.
More storage = more history retained.

  ┌───┬───────┬──────────────────────────────────────────┬──────────┐
  │ # │ Size  │ Best for                                 │ Est.Cost │
  ├───┼───────┼──────────────────────────────────────────┼──────────┤
  │ 1 │  1 GB │ Light use — good for trying it out       │ ~$0.15/mo│
  │ 2 │  5 GB │ Most users — enough for everyday use     │ ~$0.75/mo│
  │ 3 │ 10 GB │ Heavy use — lots of conversations/files  │ ~$1.50/mo│
  └───┴───────┴──────────────────────────────────────────┴──────────┘

  Prices are estimates. Check current rates: https://fly.io/calculator

> **Official docs**: Volume storage = $0.15/GB/mo, pro-rated hourly. Billed whether attached or not, even when Machine is stopped. Default 1GB, max 500GB. Cannot be reduced, only extended. One volume per Machine, one Machine per volume. Encrypted at rest by default. Snapshots: $0.08/GB/mo (first 10GB free). CLI: `fly volumes create <name> --app <app> --size <GB> --region <region> --json --yes`. Source: https://fly.io/docs/about/pricing/

Choose a size [2]:
```

### Affected modules

- **`lib/deploy.sh:deploy_collect_volume_size()`** (line 618) — Renders the volume size table and reads user choice. Add "Best for" column with non-technical guidance, add guidance text at top ("How much storage should your agent have?"), add pricing disclaimer footer.

---

## 6. LLM Provider Selection

Remove the "Custom" option from the interactive menu **temporarily** (simplifying for non-technical users). Keep OpenRouter and Nous Portal. Add **Nous Portal API key verification** with a safe fallback path when the verification endpoint is unavailable.

```
Select LLM provider:
  ┌───┬────────────────┬──────────────────────────────┐
  │ # │ Provider       │ URL                          │
  ├───┼────────────────┼──────────────────────────────┤
  │ 1 │ OpenRouter     │ openrouter.ai                │
  │ 2 │ Nous Portal    │ portal.nousresearch.com      │
  │ 3 │ Custom         │ your own endpoint            │
  └───┴────────────────┴──────────────────────────────┘
Choice [1]:
```

### Updated output

```
Which AI provider should power your agent?

  ┌───┬────────────────┬──────────────────────────────┐
  │ # │ Provider       │ Website                      │
  ├───┼────────────────┼──────────────────────────────┤
  │ 1 │ OpenRouter     │ openrouter.ai                │
  │ 2 │ Nous Portal    │ portal.nousresearch.com      │
  └───┴────────────────┴──────────────────────────────┘
Choose a provider [1]:
```

### Changes

- Remove option 3 (Custom) from the menu for standard users.
- Preserve an **expert path** for custom endpoints via explicit override contract:
  - `DEPLOY_LLM_PROVIDER=custom`
  - `DEPLOY_LLM_BASE_URL=<url>`
  - `DEPLOY_API_KEY=<key>`
  This contract must map to `LLM_BASE_URL` and `LLM_API_KEY` secrets exactly as today's custom branch does.
- Add Nous API key verification, but do **not** fail closed on endpoint ambiguity/outage:
  - If API returns clear auth failure (401/403): reject and re-prompt.
  - If endpoint/network is indeterminate (timeout/5xx/unexpected schema): warn and allow "continue anyway".

### Affected modules

- **`lib/deploy.sh:deploy_collect_llm_config()`** (line 654) — Renders the provider selection menu and handles the full LLM config flow (provider → key → model). Remove option 3 (Custom) from the menu, update the case statement to handle the new 2-option layout. Add a new `deploy_validate_nous_key()` function (new, ~20 lines) modeled after `deploy_validate_openrouter_key()`.
- **`lib/deploy.sh:deploy_validate_openrouter_key()`** (line 794) — Existing OpenRouter key validation. No changes needed; serves as the template for the new Nous Portal validator.
- **`lib/deploy.sh:deploy_provision_resources()`** (lines 908-973) — Keep custom-provider secret mapping intact for expert overrides even while custom is hidden from the interactive menu.

> **Official docs**: The OpenRouter key validation pattern uses `GET https://openrouter.ai/api/v1/key` with `Authorization: Bearer <key>`. Response JSON contains `data.label`, `data.usage` (USD), `data.limit`, `data.is_free_tier` (boolean), `data.limit_remaining`, and `data.rate_limit`. Returns 401 for invalid keys. No official Nous Portal key validation endpoint documentation was found — may need to test `/api/v1/models` with Bearer auth and check for 401/403 as a proxy validation. Source: https://openrouter.ai/docs/api/api-reference/api-keys/get-current-key

---

## 7. API Key Prompt

When the menu asks for a key it should produce a **direct link** to the website where to get it.

**Current output:**

```
Choice [1]: 1
OpenRouter API key (required):
```

**Updated output (OpenRouter):**

```
Get your API key at: https://openrouter.ai/settings/keys

> **Official docs**: OpenRouter keys are created at https://openrouter.ai/keys and managed at https://openrouter.ai/settings/keys (confirmed). Auth header format: `Authorization: Bearer <OPENROUTER_API_KEY>`. Optional headers: `HTTP-Referer` (site URL for rankings), `X-OpenRouter-Title` (site name). Exposed keys trigger email notifications. Source: https://openrouter.ai/docs/api/reference/authentication

OpenRouter API key (required):
```

**Updated output (Nous Portal):**

```
Get your API key at: https://portal.nousresearch.com

Nous Portal API key (required):
```

### Changes

- Show the direct link to get the API key before the prompt for each provider.
- Keep the existing key validation flow (format check + API verification).

### Affected modules

- **`lib/deploy.sh:deploy_collect_llm_config()`** (line 654) — The API key prompt is part of this function. Add the direct link to the key creation page (`https://openrouter.ai/settings/keys` or `https://portal.nousresearch.com`) before the `ui_ask_secret` call, based on which provider was selected.

---

## 8. Model Selection (OpenRouter)

Replace the static hardcoded model list with a **dynamic curated list** fetched from the OpenRouter API. Use the user's already-validated API key to call `GET https://openrouter.ai/api/v1/models` (Bearer auth required), then filter to the top 15-20 well-known models grouped by provider (Anthropic, Google, Meta, OpenAI, Mistral, etc.).

If the user wants a model not in the curated list, they can enter a model ID manually with guided instructions pointing to <https://openrouter.ai/models> to find the correct ID.

```
Select model:
  ┌───┬────────────────────┬─────────────────────┐
  │ # │ Model              │ Notes               │
  ├───┼────────────────────┼─────────────────────┤
  │ 1 │ Claude Sonnet 4    │ balanced, recommended │
  │ 2 │ Claude Haiku 4.5   │ fast & affordable   │
  │ 3 │ Gemini 2.5 Flash   │ fast alternative    │
  │ 4 │ Llama 4 Maverick   │ open source         │
  │ 5 │ Custom model ID    │ enter manually      │
  └───┴────────────────────┴─────────────────────┘
Choice [1]: 1
```

### Updated output

```
Fetching available models from OpenRouter...

Which AI model should your agent use?

  ┌────┬─────────────────────────────┬───────────┬─────────────────────┐
  │ #  │ Model                       │ Provider  │ Notes               │
  ├────┼─────────────────────────────┼───────────┼─────────────────────┤
  │  1 │ Claude Sonnet 4             │ Anthropic │ balanced, popular   │
  │  2 │ Claude Haiku 4.5            │ Anthropic │ fast & affordable   │
  │  3 │ Claude Opus 4               │ Anthropic │ most capable        │
  │  4 │ GPT-4o                      │ OpenAI    │ versatile           │
  │  5 │ GPT-4o Mini                 │ OpenAI    │ fast & affordable   │
  │  6 │ Gemini 2.5 Flash            │ Google    │ fast alternative    │
  │  7 │ Gemini 2.5 Pro              │ Google    │ high quality        │
  │  8 │ Llama 4 Maverick            │ Meta      │ open source         │
  │  9 │ Mistral Large               │ Mistral   │ multilingual        │
  │ 10 │ Other                       │           │ enter model ID      │
  └────┴─────────────────────────────┴───────────┴─────────────────────┘
Choose a model [1]:
```

**If user picks "Other":**

```
Enter the model ID exactly as shown on https://openrouter.ai/models
Example: anthropic/claude-sonnet-4

Model ID:
```

### Implementation detail

- **API call**: `GET https://openrouter.ai/api/v1/models` with `Authorization: Bearer {user_api_key}`. Response returns a `data` array with `id`, `name`, `pricing`, `context_length`, etc.

> **Official docs**: Response schema: `{"data": [Model, ...]}`. Each Model object contains: `id` (string, format: `provider/model-name` e.g. `anthropic/claude-sonnet-4`), `name` (display name), `canonical_slug`, `created` (unix timestamp), `description`, `pricing` (object: prompt/completion/request/image/audio/web_search costs), `context_length` (int), `architecture` (tokenizer, instruction_type, modalities), `top_provider`, `per_request_limits`, `supported_parameters`, `default_parameters`, `hugging_face_id`, `expiration_date`. Optional query param `category` filters by use case (programming, roleplay, marketing, etc.) — NOT by provider. Provider filtering must be done client-side by parsing the `id` prefix. Returns 200/400/500. Source: https://openrouter.ai/docs/api/api-reference/models/get-models
- **Curation filter**: Only show models from well-known providers (Anthropic, Google, Meta/Llama, OpenAI, Mistral). Filter to ~15-20 models total. Group by provider in the display.

> **Official docs**: Model `id` format is `provider/model-name` (e.g., `anthropic/claude-sonnet-4`). No server-side provider filter exists — the `category` param filters by use case only. Client-side filtering required: parse `id` prefix before '/' and match against whitelist (`anthropic`, `openai`, `google`, `meta-llama`, `mistralai`). API returns 400+ models total. Source: https://openrouter.ai/docs/api/api-reference/models/get-models
- **Fallback**: If the API call fails, fall back to the current static list (Claude Sonnet 4, Claude Haiku 4.5, Gemini 2.5 Flash, Llama 4 Maverick).
- **Manual entry**: Keep an "Other" option at the bottom. When selected, show guided instructions pointing to https://openrouter.ai/models with an example model ID format.
- **Display format**: Show model name, provider, and a brief note (context length or pricing tier) in a numbered list.

#### Review amendment (2026-03-08): parsing contract

- Prefer `jq` for OpenRouter model JSON parsing when available.
- If `jq` is not available (or parsing fails), do **not** parse the full model payload with brittle grep/sed extraction; instead:
  - fall back to the static curated model list, and
  - keep "Other" manual model ID entry.
- This avoids model ID/name mismatches from schema drift while preserving a reliable UX.

### Affected modules

- **`lib/deploy.sh:deploy_collect_llm_config()`** (line 654) — The model selection is currently a static list inside this function. Extract into a new `deploy_collect_model()` function (~80 lines) that: (1) calls `GET /api/v1/models` with the user's API key via `curl`, (2) filters to whitelisted providers client-side by parsing the `id` prefix, (3) renders the curated table, (4) handles the "Other" option with manual ID entry, (5) falls back to the current static list on API failure.

---

## 9. Messaging Platform Selection

Remove Discord from this menu as it's not ready at the moment. Keep Telegram and Skip only.

```
Messaging Platform Setup
  ┌───┬──────────┬────────────────────────────────┐
  │ # │ Platform │ Description                    │
  ├───┼──────────┼────────────────────────────────┤
  │ 1 │ Telegram │ chat bot via @BotFather        │
  │ 2 │ Discord  │ server bot via Developer Portal│
  │ 3 │ Skip     │ configure later                │
  └───┴──────────┴────────────────────────────────┘
Choice [3]:
```

### Updated output

```
Want to chat with your agent via a messaging app?

  ┌───┬──────────┬─────────────────────────────────────────┐
  │ # │ Platform │ Description                             │
  ├───┼──────────┼─────────────────────────────────────────┤
  │ 1 │ Telegram │ Chat with your agent via Telegram bot   │
  │ 2 │ Skip     │ Set this up later                       │
  └───┴──────────┴─────────────────────────────────────────┘
Choose [2]:
```

### Changes

- Remove option 2 (Discord). Menu becomes: 1 = Telegram, 2 = Skip.
- Reword descriptions for non-technical audience.

### Affected modules

- **`lib/messaging.sh:messaging_setup_menu()`** (line 82) — Remove Discord option (row 2), change "Skip" from option 3 to option 2, update the case statement to handle the new 2-option layout, update the default from `[3]` to `[2]`, reword the header and descriptions for non-technical audience.
- **`lib/messaging.sh:messaging_setup_discord()`** (line 174) — Remove entirely (or keep the function but remove the menu path to it). Not called if Discord is removed from the menu.

---

## 10. Telegram Bot Setup

Improve the BotFather guided instructions, add **boot-time auto-configuration of the bot description** via `entrypoint.sh` (self-heals on every deploy), fix the **deny-by-default security gap** with a guided access control menu, collect the **home channel** for scheduled notifications, and add a **deep link onboarding step** so the user can immediately start chatting with their agent.

### Research findings: Can we eliminate BotFather?

The user's ideal flow is zero-friction: no BotFather, bot appears ready to use and messages them when deployment is done. Exhaustive research into the Telegram Bot API, MTProto API, and python-telegram-bot library confirms the following:

| Approach | Possible? | Eliminates BotFather? | Risk | Verdict |
|---|---|---|---|---|
| Bot API (`createBot` or similar) | No — method does not exist | N/A | N/A | Dead end |
| MTProto API (`bots.createBot`) | No — method does not exist in TL schema | N/A | N/A | Dead end |
| python-telegram-bot library | No — wraps Bot API, which lacks creation methods | N/A | N/A | Dead end |
| Automate BotFather via Telethon/Pyrogram | Technically yes | Yes | **Very high** — ToS violation, account bans, phone verification, session security | Not viable |
| Shared bot architecture | Yes | Yes (for end users) | Medium — requires central router service | Future enhancement (see Section 11) |
| Telegram Login Widget + `requestWriteAccess` | Yes | No (bot must exist first) | Low | Useful for bypassing /start, not for bot creation |
| Deep links (`t.me/bot?start=payload`) | Yes | No (bot must exist first) | None | **Implement now** — low effort, high impact |

**Conclusion**: BotFather is required for the current architecture (one bot token = one gateway instance). The best short-term improvement is to streamline the existing flow with deep links and auto-configuration. The only way to fully eliminate BotFather for end users is a shared bot architecture (Section 11).

### Current output

```
--- Telegram Bot Setup ---
To create a Telegram bot:
  1. Open Telegram and search for @BotFather
  2. Send /newbot and follow the prompts
  3. Copy the bot token provided

Bot token:
```

### Updated output

```
--- Telegram Bot Setup ---

To connect your agent to Telegram, you need a bot token.
If you already have one, paste it below. Otherwise, follow
these steps to create one (takes ~1 minute):

  1. Open Telegram and go to: https://t.me/BotFather
  2. Send the message /newbot
  3. BotFather will ask you for a name and username — pick anything
  4. Copy the token it gives you (looks like: 123456789:ABCdef...)

Bot token:
```

**After pasting a valid token:**

```
Verifying token with Telegram...
Found bot: @my_hermes_bot (My Hermes Bot)

Bot description will be configured when your agent starts.

Who should be able to use this bot?

  ┌───┬──────────────────────┬─────────────────────────────────────────────────┐
  │ # │ Option               │ Description                                     │
  ├───┼──────────────────────┼─────────────────────────────────────────────────┤
  │ 1 │ Only me              │ Just you — enter your Telegram user ID          │
  │ 2 │ Specific people      │ You and others — enter comma-separated IDs      │
  │ 3 │ Anyone               │ No restrictions — anyone who finds the bot      │
  └───┴──────────────────────┴─────────────────────────────────────────────────┘
Choose [1]:
```

**If user picks "Only me" or "Specific people":**

```
To find your Telegram user ID:
  1. Open Telegram and go to: https://t.me/userinfobot
  2. Send any message — it replies with your numeric user ID
     (looks like: 123456789)

Your Telegram user ID:
```

**After entering user ID(s) — home channel prompt:**

```
Your agent can send you scheduled notifications and reminders
(like daily summaries or cron tasks) to your Telegram chat.

Use your user ID (123456789) as the notification channel? [Y/n]:
```

**If user picks "Anyone":**

```
⚠ Open access: anyone who finds your bot can message it.
  This means anyone on Telegram can chat with your agent.
  You can restrict access later by setting TELEGRAM_ALLOWED_USERS.

Confirm open access? [y/N]:
```

**After deployment succeeds — deep link onboarding:**

```
Your agent is live! Open this link to start chatting:

  https://t.me/my_hermes_bot?start=hermes-alex-521

Or scan the QR code above in Telegram.
Press START when the chat opens — your agent is ready.
```

### Changes

#### Improved guidance

- Add direct links: `https://t.me/BotFather` and `https://t.me/userinfobot`.
- Clarify each step for non-technical users with more detail.
- Show what happens after validation (bot found, description set).
- Keep the existing token validation flow (format check via regex, then `getMe` API call to verify token and extract bot username/name).

#### Auto-configure bot description (boot-time)

Bot description and short description are set **at boot-time by `entrypoint.sh`**, not during the deploy wizard. This approach self-heals on every deploy/restart — if the description gets cleared or the container is recreated, it's re-applied automatically.

**How it works:**

1. During the wizard, hermes-fly collects the deployment name (e.g., `hermes-alex-521`) and sets it as a Fly secret: `HERMES_APP_NAME`.
2. `entrypoint.sh` reads `HERMES_APP_NAME` and `TELEGRAM_BOT_TOKEN` at boot, then calls:
   - **`setMyDescription`**: `"Hermes AI Agent (hermes-alex-521) — Your AI assistant powered by Hermes on Fly.io"` (~75 chars, within 512-char limit)
   - **`setMyShortDescription`**: `"Hermes AI Agent — hermes-alex-521"` (~34 chars, within 120-char limit)
3. On each boot, compare current bot description/short description with desired values and only call `setMyDescription` / `setMyShortDescription` when values differ.
4. If Bot API calls fail (network error, API change), `entrypoint.sh` logs a warning and continues — it never blocks gateway startup.

**Note (supersedes previous flag-file approach):** do not use a persistent "already configured" file as the primary gate, because it prevents true self-healing when the profile text drifts later.

> **Official docs**: `setMyDescription`: POST, params: `description` (string, 0-512 chars), `language_code` (optional, ISO 639-1). Returns True on success. Description appears in empty chat as "What can this bot do?" text. Pass empty string to remove. `setMyShortDescription`: POST, params: `short_description` (string, 0-120 chars), `language_code` (optional). Returns True on success. Short description appears on bot's profile page as "About" text. Both support per-language descriptions. Proposed descriptions (~75 and ~34 chars respectively) are within limits. Source: https://core.telegram.org/bots/api

> **Official docs**: Telegram rate limits: ~1 msg/sec per private chat, ~20 msgs/min per group, ~30 msgs/sec bulk broadcasting. No specific limits documented for config methods (setMyDescription, setMyShortDescription). The 2 API calls at boot are well within any reasonable limit. Source: https://core.telegram.org/bots/faq

#### Deep link onboarding

After successful deployment, generate and display a Telegram deep link so the user can immediately start chatting with their agent without searching for the bot manually.

- **Format**: `https://t.me/<bot_username>?start=<app_name>`
- **Payload**: The Fly.io app name (e.g., `hermes-alex-521`). Payload constraints: A-Z, a-z, 0-9, `_`, `-`, max 64 characters. The app name already satisfies these constraints.

> **Official docs**: Confirmed. Deep link payload allows A-Z, a-z, 0-9, _ and - up to 64 characters. Telegram recommends base64url for binary content. Bot receives `/start <payload>` in private chats, `/start@bot_username <payload>` in groups. Fly.io app names (lowercase alphanum + hyphens, max 63 chars) are a valid subset of payload chars. Source: https://core.telegram.org/bots/features#deep-linking
- **Behavior**: When the user clicks the link, Telegram opens a private chat with the bot and shows a START button. Pressing START sends `/start <app_name>` to the bot. Hermes Agent's gateway handles the `/start` command and the user is immediately connected.
- **QR code (optional)**: If `qrencode` is available on the system, generate a terminal QR code for the deep link. If not available, skip silently — the clickable link is sufficient.
- **Display timing**: Show the deep link at the very end of the deploy wizard, after health checks pass. This is the final output the user sees.

#### What hermes-fly does NOT need to configure

- **Webhook**: Hermes Agent uses long polling (`start_polling`), not webhooks. No external webhook setup needed.
- **Bot commands**: Hermes Agent already calls `set_my_commands` on gateway startup, registering `/new`, `/model`, `/status`, `/help`, etc.
- **Message handling**: Fully handled by the Hermes Agent gateway internally.

#### What python-telegram-bot and the Bot API CAN do (post-token)

These tools operate on an **existing** bot token. They cannot create bots, but they power everything after the token is obtained:

- **`getMe`** — Verify the token and retrieve bot username/name (already implemented in `messaging_validate_telegram_token_api`).

> **Official docs**: `getMe` returns User object: `id` (int), `is_bot` (bool), `first_name` (string), `username` (string, optional), `last_name` (optional), `language_code` (optional), plus getMe-exclusive fields: `can_join_groups`, `can_read_all_group_messages`, `supports_inline_queries`, `can_connect_to_business`, `has_main_web_app`. Response wrapped in `{"ok":true,"result":{...}}`. Current implementation at `lib/messaging.sh:34` correctly parses `username` and `first_name`. Source: https://core.telegram.org/bots/api
- **`setMyDescription`** / **`setMyShortDescription`** — Auto-configure the bot's profile text (new, via `curl`).
- **`setMyCommands`** — Register slash commands (already done by Hermes Agent on gateway startup).

> **Official docs**: `setMyCommands` params: `commands` (array of BotCommand: `command` 1-32 chars lowercase a-z/0-9/underscores, `description` 1-256 chars), `scope` (optional BotCommandScope), `language_code` (optional ISO 639-1). Returns True on success. Source: https://core.telegram.org/bots/api
- **`sendMessage`** — Send messages to users who have started the bot. Used by Hermes Agent for all responses.
- **Long polling via `getUpdates`** — How Hermes Agent receives incoming messages (handled internally by python-telegram-bot library in Hermes Agent).

The python-telegram-bot library is used by Hermes Agent internally for all Telegram communication. hermes-fly does not need to use it directly — raw `curl` calls to the Bot API are sufficient for the deploy wizard's needs (token validation via `getMe`) and boot-time configuration (`setMyDescription`, `setMyShortDescription` in `entrypoint.sh`).

#### Access control menu (deny-by-default fix)

Hermes Agent's gateway uses a **deny-by-default** security model: if no allowed users are configured and `GATEWAY_ALLOW_ALL_USERS` is not set to `true`, the bot silently ignores all incoming messages. The current wizard says "Leave blank to allow all users" — this is wrong and results in a bot that appears broken.

Replace the free-text user ID prompt with a **3-option access control menu**:

1. **Only me** — Collect the user's Telegram user ID. Set `TELEGRAM_ALLOWED_USERS` to that ID.
2. **Specific people** — Collect comma-separated Telegram user IDs. Set `TELEGRAM_ALLOWED_USERS` to the list.
3. **Anyone** — Set `GATEWAY_ALLOW_ALL_USERS=true`. Show a warning explaining the implications and require explicit confirmation (`[y/N]` — defaults to No).

For options 1 and 2, provide step-by-step instructions for finding a Telegram user ID via `@userinfobot` (`https://t.me/userinfobot`), with an example of what the ID looks like.

#### Home channel collection

After collecting user IDs (options 1 or 2), prompt the user to set up a **home channel** for scheduled notifications and reminders (daily summaries, cron tasks). Hermes Agent supports this via the `TELEGRAM_HOME_CHANNEL` environment variable.

- Auto-suggest using the first allowed user ID as the home channel (private chat delivery).
- Default to Yes (`[Y/n]`) since most single-user deployments want notifications in their own chat.
- If user picks "Anyone" (option 3), skip the home channel prompt — there's no single user to notify.

#### New Fly secrets

These new secrets are added to the `fly secrets set` call in `deploy_provision_resources()`:

| Secret | Source | When set |
|---|---|---|
| `HERMES_APP_NAME` | Deployment name from step 2 (e.g., `hermes-alex-521`) | Always |
| `GATEWAY_ALLOW_ALL_USERS` | Access control menu option 3 ("Anyone") | Only if user picks "Anyone" |
| `TELEGRAM_HOME_CHANNEL` | User ID from access control menu | Only if user confirms home channel |

### Affected modules

- **`lib/messaging.sh:messaging_setup_telegram()`** (line 120) — Main Telegram setup function. Major rewrite: (1) Update BotFather instructions with direct links (`https://t.me/BotFather`, `https://t.me/userinfobot`), improve step descriptions for non-technical users. (2) Replace the free-text user ID prompt with a 3-option access control menu (Only me / Specific people / Anyone). (3) Add `GATEWAY_ALLOW_ALL_USERS=true` when user picks "Anyone" (with `[y/N]` confirmation). (4) Add home channel prompt after user ID collection. (5) Remove bot description curl calls (moved to entrypoint.sh). Return collected values (`TELEGRAM_ALLOWED_USERS`, `GATEWAY_ALLOW_ALL_USERS`, `TELEGRAM_HOME_CHANNEL`) to the caller for inclusion in the secrets array.
- **`lib/messaging.sh:messaging_validate_telegram_token_api()`** (line 34) — Validates token via `getMe`. No changes needed; already extracts `username` and `first_name`.
- **`lib/deploy.sh:deploy_provision_resources()`** (lines 908-973) — Assembles the secrets array and calls `fly_set_secrets`. Add three new secrets: `HERMES_APP_NAME` (always), `GATEWAY_ALLOW_ALL_USERS` (if "Anyone" selected), `TELEGRAM_HOME_CHANNEL` (if confirmed by user).
- **`lib/deploy.sh:cmd_deploy()`** (line 1191) — The main deploy orchestrator. After health checks pass at the end of the deploy flow, add deep link output: generate `https://t.me/{bot_username}?start={app_name}` and display it. Optionally generate a QR code via `qrencode` if available.
- **`templates/entrypoint.sh`** — Add boot-time bot description configuration: read `HERMES_APP_NAME` and `TELEGRAM_BOT_TOKEN`, read current profile text, and reconcile drift by calling `setMyDescription` and `setMyShortDescription` via `curl` only when needed. Log warning and continue on failure — never block gateway startup.

---

## 11. Rejected Alternative: Shared Bot Architecture

This section documents why a centrally-managed Telegram bot was considered and rejected, so future contributors don't re-propose it.

### The idea

Instead of each user creating their own bot via @BotFather, hermes-fly would operate a single shared bot (e.g., `@HermesFlyBot`) with a central webhook-based router that forwards messages to each user's Fly.io deployment.

### Why it was rejected

1. **Incompatible with open source.** hermes-fly is MIT-licensed. Only one entity can own a Telegram bot username — forks and community deployments cannot reuse `@HermesFlyBot`. A self-contained CLI tool should not depend on a specific maintainer's centralized service.

2. **Operational burden.** A central router requires permanent infrastructure, ongoing maintenance, monitoring, and cost. Open-source CLI tools should be deploy-and-forget for the maintainer — not SaaS products with uptime obligations.

3. **Privacy conflict.** All user messages would route through a single operator's service. This directly contradicts the purpose of deploying your *own* private AI agent.

4. **Upstream dependency.** Hermes Agent uses long polling (`start_polling`) with one bot token per gateway instance. The shared model would require upstream changes to `hermes-agent` (switching to dispatched messages via an internal API) — a codebase this project does not control.

5. **Single point of failure.** If the shared bot or router goes down, every user's Telegram integration breaks simultaneously.

6. **Telegram rate limits.** A shared bot serving many users would hit Telegram's rate limits (~30 msgs/sec bulk, ~1 msg/sec per chat) much faster than individual per-user bots.

### Other alternatives considered and rejected

- **Automating BotFather** via MTProto user account libraries (Telethon/Pyrogram): Technically possible but violates Telegram's Terms of Service, risks account bans, and requires phone number authentication — worse UX than BotFather itself.
- **Telegram Login Widget** with `requestWriteAccess`: Can bypass the `/start` requirement but still requires an existing bot, a web page on a registered domain, and centralized infrastructure. Not CLI-native.
- **Programmatic bot creation** via Bot API or MTProto: Does not exist. No `createBot` method in any Telegram API. See the research findings table in Section 10.

### Chosen approach

Section 10's flow is the right solution for an open-source project: each user creates their own bot via @BotFather (with improved step-by-step guidance), hermes-fly auto-configures the bot description, and a deep link is generated for immediate onboarding. This keeps the tool self-contained, privacy-respecting, and fork-friendly.

### Affected modules

No code changes. This section is documentation-only — it records a rejected design alternative for future contributors.

---

## Implementation Notes

- **All changes in a single pass** — no phasing.
- **Pure Bash baseline** — OpenRouter API and Telegram Bot API calls use `curl`.
- **JSON parsing contract** — use `jq` when available for OpenRouter model payloads; if `jq` is unavailable, use static curated fallback + manual model entry instead of brittle full-payload grep/sed parsing.

> **Official docs**: `fly secrets set NAME=VALUE NAME=VALUE ... [flags]`. Multiple secrets in one command as space-separated pairs. Flags: `-a/--app` (app name), `--stage` (set without deploying — useful for batching), `--detach` (return immediately), `--dns-checks` (default true). Already wrapped as `fly_set_secrets()` in `lib/fly-helpers.sh:147`. Use `--stage` to batch-set secrets before final deploy. Source: https://fly.io/docs/flyctl/secrets-set/
- **Non-technical audience throughout** — use practical advice ("good for trying it out") over technical jargon ("shared CPU"). Show technical specs in parentheses for users who want them.
- **Pricing disclaimers** on all cost displays: "Prices are estimates. Check current rates at https://fly.io/calculator"
- **Graceful fallbacks** — if OpenRouter model API fails, fall back to static list. If Telegram auto-configure fails, show warning and continue.

---

## 12. Test & Mock Migration Plan (Required)

The UX changes above must ship with synchronized tests and mocks. This is required to avoid regressions and CI failures.

### Test files to update

- **`tests/deploy.bats`**
  - Update provider menu assertions from 3 options to 2 options.
  - Add expert override tests for hidden custom path (`DEPLOY_LLM_PROVIDER=custom` contract still works).
  - Add Nous verification tests for: valid, invalid (401/403), and indeterminate/outage ("continue anyway").
  - Add OpenRouter model-selection tests for both parsing paths:
    - `jq` available path
    - fallback static list path when parsing is unavailable/fails
  - Update VM tier tests to assert behavior when a desired tier (for example `performance-2x`) is missing.
  - Update region tests to assert dynamic counts and unknown-code routing to "Other".
- **`tests/messaging.bats`**
  - Update Telegram setup tests for the new access-control menu (Only me / Specific people / Anyone).
  - Add tests for `[y/N]` confirmation in "Anyone" mode.
  - Add tests for home-channel prompt behavior (shown for options 1/2, skipped for option 3).
  - Update messaging platform menu tests to remove Discord option and shift Skip to option 2.
- **`tests/scaffold.bats`**
  - Replace/extend entrypoint assertions for bot-description logic:
    - presence of drift-check flow
    - no hard dependency on a persistent "already configured" flag gate
  - Assert new secrets are bridged where applicable (`HERMES_APP_NAME`, `GATEWAY_ALLOW_ALL_USERS`, `TELEGRAM_HOME_CHANNEL`).
- **`tests/fly-helpers.bats`** (if needed)
  - Verify no regression in secrets-setting wrapper with expanded secret list.

### Mock updates required

- **`tests/mocks/curl`**
  - Add mock branches for Nous verification endpoint(s), including success, 401/403, and indeterminate failures.
  - Add mock support for OpenRouter models payload (stable fixture for curated filtering tests).
  - Add Telegram bot-description endpoints used by entrypoint reconciliation (`getMyDescription`, `getMyShortDescription`, `setMyDescription`, `setMyShortDescription`).
- **`tests/mocks/fly`**
  - Add vm-size fixture variants to simulate missing tiers (for compatibility-guardrail tests).
  - Add region fixture variant with unknown/new region code (for "Other" bucket tests).

### Acceptance gate

- No deploy-wizard or messaging tests removed; tests are updated to new behavior.
- New/changed tests cover all fallback branches introduced by this plan.
- CI passes in an environment without `jq` and in one with `jq`.

---

## References

- [Telegram Bot API documentation](https://core.telegram.org/bots/api)
- [Telegram Bot FAQ (Rate Limits)](https://core.telegram.org/bots/faq)
- [Telegram Bot Features (Deep Linking)](https://core.telegram.org/bots/features#deep-linking)
- [Telegram Login Widget](https://core.telegram.org/widgets/login)
- [Telegram deep links documentation](https://core.telegram.org/api/links)
- [Telegram MTProto bots documentation](https://core.telegram.org/api/bots)
- [OpenRouter API - Get Models](https://openrouter.ai/docs/api/api-reference/models/get-models)
- [OpenRouter API - Get Current Key](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-key)
- [OpenRouter API - Authentication](https://openrouter.ai/docs/api/reference/authentication)
- [OpenRouter API - Rate Limits](https://openrouter.ai/docs/api/reference/limits)
- [Fly.io Apps Create CLI](https://fly.io/docs/flyctl/apps-create/)
- [Fly.io - fly platform regions](https://fly.io/docs/flyctl/platform-regions/)
- [Fly.io Regions Reference](https://fly.io/docs/reference/regions/)
- [Fly.io - fly orgs list](https://fly.io/docs/flyctl/orgs-list/)
- [Fly.io Secrets Set CLI](https://fly.io/docs/flyctl/secrets-set/)
- [Fly.io - fly volumes create](https://fly.io/docs/flyctl/volumes-create/)
- [Fly.io Resource Pricing](https://fly.io/docs/about/pricing/)
- [Fly.io Machine Sizing Guide](https://fly.io/docs/machines/guides-examples/machine-sizing/)
- [Fly.io - Volumes overview](https://fly.io/docs/volumes/overview/)
- [Fly.io app name community discussion](https://community.fly.io/t/app-name-restrictions/4487)
- [RFC 1035 - Domain Names Implementation and Specification](https://datatracker.ietf.org/doc/html/rfc1035)
- [python-telegram-bot Constants (v21.7)](https://docs.python-telegram-bot.org/en/v21.7/telegram.constants.html)

---

## Plan Review Findings (2026-03-08)

### Verdict

Original review verdict: needed revision before implementation due to several high-risk gaps.  
Current status: this file has been amended non-destructively to address those gaps (see review-amendment notes in Sections 3, 4, 6, 8, 10 and the new Section 12 test/mocks plan).

### Findings (ordered by severity)

1. **High — "Self-healing on every restart" is contradicted by persistent flag-file behavior.**  
   Evidence: Section 10 claims boot-time self-healing on every deploy/restart (lines 479, 598-599), but later specifies `/root/.hermes/.bot_description_set` to skip subsequent runs (line 606).  
   Impact: bot descriptions will *not* self-heal after first successful run if they are later cleared/changed.  
   Required fix: either remove the persistent skip flag, or compare current description and update when drift is detected.

2. **High — Removing the Custom provider path can silently break existing custom endpoint workflows.**  
   Evidence: Section 6 removes Custom from menu (line 282) and suggests env vars as fallback (line 312), but current provisioning only sets `LLM_BASE_URL`/`LLM_API_KEY` when `DEPLOY_LLM_PROVIDER=custom` ([deploy.sh](/Users/alex/Documents/GitHub/hermes-fly/lib/deploy.sh#L937)).  
   Impact: users setting only base URL/key will not get correct secrets unless provider state is also forced to `custom`.  
   Required fix: define an explicit expert path (CLI flag/env contract) that reliably sets provider + secrets mapping, and document it.

3. **High — Nous key validation is planned against an undocumented endpoint with fail-closed behavior.**  
   Evidence: Section 6 notes no official Nous validation endpoint and proposes `/api/v1/models` as proxy (line 320), while also requiring validation before proceeding (lines 313, 317).  
   Impact: valid keys can be rejected during transient/API changes; deploy flow can become blocked.  
   Required fix: make Nous verification soft-fail with explicit "continue anyway" fallback, or validate only format pre-deploy and defer hard failure to runtime checks.

4. **High — Dynamic OpenRouter model curation lacks a robust parsing contract.**  
   Evidence: Section 8 introduces large dynamic model payload handling (lines 419-424), but implementation notes still target pure Bash/grep/sed patterns (line 728).  
   Impact: fragile parsing can mis-map model IDs/names and inject incorrect selections.  
   Required fix: define a deterministic parser strategy (prefer `jq`; if unavailable, keep a vetted static allowlist + API enrichment only for metadata).

5. **Medium — VM tier table proposes `performance-2x` without compatibility guardrails.**  
   Evidence: Updated VM output replaces current option set with a `Power` tier using `performance-2x` (line 219), while current code and fallbacks are built around `dedicated-cpu-1x` ([deploy.sh](/Users/alex/Documents/GitHub/hermes-fly/lib/deploy.sh#L547), [deploy.sh](/Users/alex/Documents/GitHub/hermes-fly/lib/deploy.sh#L508)).  
   Impact: option may be unavailable in some org/region contexts, leading to post-selection deploy failure.  
   Required fix: only present tiers that exist in `fly platform vm-sizes --json` for the active account/region; keep a safe fallback tier.

6. **Medium — Region step assumes static geography while data is dynamic.**  
   Evidence: Section 3 cites a fixed 18-region/6-continent framing (line 187) but also requires dynamic fetches (line 180).  
   Impact: stale mappings and incorrect counts as Fly adds/renames regions.  
   Required fix: preserve an "Other" bucket in step 1, compute counts from live data, and keep static mapping only as fallback metadata.

7. **Medium — No explicit test/mocks workstream is included despite large prompt/menu/API refactors.**  
   Evidence: Plan touches deploy and messaging flows heavily (Sections 1-10), but there is no test migration section; existing suites tightly assert current menus and options ([tests/deploy.bats](/Users/alex/Documents/GitHub/hermes-fly/tests/deploy.bats), [tests/messaging.bats](/Users/alex/Documents/GitHub/hermes-fly/tests/messaging.bats), [tests/mocks/curl](/Users/alex/Documents/GitHub/hermes-fly/tests/mocks/curl)).  
   Impact: high regression risk and likely CI failures.  
   Required fix: add a dedicated "Test Plan" section listing required updates for `deploy.bats`, `messaging.bats`, `scaffold.bats`, and `tests/mocks/curl`.
