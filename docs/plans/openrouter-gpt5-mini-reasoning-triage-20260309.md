# Plan: OpenRouter Reasoning Compatibility at Setup

Date: 2026-03-09

## Context

This plan started from one confirmed production failure:

- `hermes-fly deploy`
- provider selected: OpenRouter
- model selected: `openai/gpt-5-mini`
- runtime error in Telegram:
  - provider metadata: `Azure`
  - model snapshot: `gpt-5-mini-2025-08-07`
  - invalid param: `reasoning.effort`
  - invalid value: `xhigh`
  - supported values: `minimal`, `low`, `medium`, `high`

This plan now addresses two concerns:

1. Users should be able to choose reasoning effort during `hermes-fly` setup.
2. The compatibility problem likely affects more than just GPT-5 mini, so the fix must be broader than a one-model patch.

## What is confirmed

### Confirmed incident

The observed failure is real and specific:

- the deployed runtime sent `reasoning.effort=xhigh`
- the serving provider rejected that request for GPT-5 mini
- the provider did not reject the model alias itself

This means the strongest current signal is:

- model/parameter compatibility failure
- not yet proven bad model-ID fetch

### Confirmed current hermes-fly behavior

Current code in this repo:

- `deploy_collect_llm_config()` validates the OpenRouter key and then presents a hardcoded static model selection table
- the model list is defined inline within `deploy_collect_llm_config()` (no separate function, no API fetch)
- it offers four preset models plus a manual-entry option
- it does not evaluate model-specific reasoning compatibility

Local refs:

- `lib/deploy.sh:654-788` (deploy_collect_llm_config with inline model selection)
- `lib/deploy.sh:817-868` (deploy_collect_config calling deploy_collect_llm_config)

Current persistence behavior:

- `hermes-fly` stores `OPENROUTER_API_KEY`
- `hermes-fly` stores `LLM_MODEL`
- `templates/entrypoint.sh` bridges `LLM_MODEL` into `/root/.hermes/.env` and patches `config.yaml`

Local refs:

- `lib/deploy.sh:945` (Fly secrets set) and `lib/deploy.sh:1129` (deploy summary YAML)
- `templates/entrypoint.sh:17-30`

There is no `xhigh` literal in `hermes-fly` itself.

### Confirmed current deploy pin behavior

For current `hermes-fly deploy`, the generated Docker build installs Hermes Agent from `main`, not from the `hermes-fly` release number.

Why:

- `deploy_create_build_context()` calls:
  - `docker_generate_dockerfile "$build_dir" "main"`
- `templates/Dockerfile.template` substitutes that value into:
  - `ARG HERMES_VERSION={{HERMES_VERSION}}`
  - `https://raw.githubusercontent.com/NousResearch/hermes-agent/${HERMES_VERSION}/scripts/install.sh`

Local refs:

- `lib/deploy.sh:878-912` (deploy_create_build_context, line 882 calls docker_generate_dockerfile with "main")
- `templates/Dockerfile.template:3,6`

Resolved conclusion:

- the previous `0.1.14` raw GitHub 404 does not describe the current deploy path
- for current deploys, runtime behavior can be attributed to Hermes Agent `main` as of build time

Separate product concern:

- deploys are not reproducible over time, because the same `hermes-fly` release can install different Hermes Agent commits if upstream `main` moves

### Confirmed live app state (2026-03-09)

Live inspection of the failing app `hermes-sprite-981` confirmed:

- `/root/.hermes/.env` contains `LLM_MODEL=openai/gpt-5-mini`
- `/root/.hermes/.env` does not contain `HERMES_REASONING_EFFORT`
- `/root/.hermes/config.yaml` contained `reasoning_effort: "xhigh"`
- the deployed Hermes Agent checkout is commit `caab1cf4536f79f5b74552f47360e178e6d28ff9`

This resolves one key ambiguity:

- in the confirmed failing app, the active source of `xhigh` was `agent.reasoning_effort` in deployed `config.yaml`
- it was not coming from `HERMES_REASONING_EFFORT` in the runtime env

Temporary mitigation already applied on the live app:

- `/root/.hermes/config.yaml` was patched from `reasoning_effort: "xhigh"` to `reasoning_effort: "medium"`

Operational caveat:

- this confirms the on-disk config source and applies a file-level mitigation
- a restart or redeploy may still be required if the running Hermes process cached the prior config at startup

### Confirmed current hermes-agent behavior

Upstream Hermes Agent currently:

- accepts `xhigh`, `high`, `medium`, `low`, `minimal`, `none` as valid reasoning settings
- reads reasoning effort from:
  - `HERMES_REASONING_EFFORT`
  - `agent.reasoning_effort` in `~/.hermes/config.yaml`
- sends a `reasoning` payload on OpenRouter and Nous requests
- defaults to `medium` when no explicit reasoning config is set

Upstream refs:

- https://github.com/NousResearch/hermes-agent/blob/main/cli.py#L106-L120
- https://github.com/NousResearch/hermes-agent/blob/main/gateway/run.py#L360-L387
- https://github.com/NousResearch/hermes-agent/blob/main/run_agent.py#L2364-L2375

Upstream default config currently says:

- `agent.reasoning_effort: "medium"`

Upstream refs:

- https://github.com/NousResearch/hermes-agent/blob/main/cli-config.yaml.example#L345-L348
- https://github.com/NousResearch/hermes-agent/blob/main/scripts/install.sh#L786-L790

### Confirmed provider constraints

Official docs during this investigation say:

- OpenAI GPT-5 docs: `gpt-5-mini` supports `minimal`, `low`, `medium`, `high`
  - https://platform.openai.com/docs/models/gpt-5
- Azure OpenAI reasoning docs say the same for GPT-5 mini
  - https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/reasoning
- OpenRouter models docs expose model metadata such as `supported_parameters` and `default_parameters`
  - https://openrouter.ai/docs/api/api-reference/models/get-models
- OpenRouter reasoning docs describe GPT-5-series reasoning more broadly, including `xhigh`
  - https://openrouter.ai/docs/guides/best-practices/reasoning-tokens

The confirmed mismatch is:

- provider/runtime reality for GPT-5 mini is narrower than the broad OpenRouter reasoning description

## What is not yet confirmed

The following are still open:

1. Which code path originally wrote `reasoning_effort: "xhigh"` into the deployed `config.yaml`.

Now narrowed by live inspection:

- not `HERMES_REASONING_EFFORT` in the runtime env
- yes: `agent.reasoning_effort: "xhigh"` in deployed `config.yaml`

Still open:

- seeded by Hermes Agent defaults at install time
- written by a post-install/setup step
- written by a later runtime migration or manual edit

2. Whether OpenRouter model metadata is rich enough to drive a complete compatibility matrix.

Known risk:

- `supported_parameters` may tell us that a model supports `reasoning`
- it may not tell us which enum values of `reasoning.effort` are valid

3. Whether this varies by effective backend provider under OpenRouter.

The observed failure came from Azure. We do not yet have a cross-provider matrix for:

- OpenAI-served
- Azure-served
- other OpenRouter backend routes

4. Whether OpenRouter model/effort compatibility differs by Hermes Agent commit even when the deploy path tracks `main`.

This is still open because:

- the inspected failing app was running Hermes Agent commit `caab1cf4536f79f5b74552f47360e178e6d28ff9`
- current deploys track `main`
- `main` changes over time
- so the same `hermes-fly` release may still produce different runtime behavior on different dates

## Scope of this plan

### What this plan fully covers

- the confirmed GPT-5 mini failure
- the current hermes-fly model-selection gap
- the current hermes-agent reasoning-effort gap
- the design needed to let users choose reasoning effort safely at setup

### What this plan does not yet fully cover

- an exhaustive all-model reasoning-effort matrix for all OpenRouter models
- all provider-backend combinations under OpenRouter
- complete proof of the exact deployed source of `xhigh`

So the answer to "have we investigated all models or just this model?" is:

- we have fully investigated one concrete failure
- we have generalized the design and fix strategy to the broader class
- we have not yet exhaustively enumerated every affected model/provider pair

## Product decision

Yes, `hermes-fly` should let the user choose reasoning effort during setup.

But it should not be a raw free-form choice.

The safe UX is:

- for OpenRouter, fetch `https://openrouter.ai/api/v1/models` after API-key validation
- derive provider groups from the fetched model IDs (for example `openai/...`, `anthropic/...`, `google/...`)
- ask the user to choose a provider first
- then show the fetched models for that provider
- ask for reasoning effort after model selection
- show only known-safe options for the selected model/provider pair
- default to `medium`
- keep `none` out of the first-run wizard
- do not offer `xhigh` unless that specific model path is explicitly known-safe
- if compatibility is unknown, either:
  - show a conservative subset only, or
  - hide the advanced choice and use `medium`

Without compatibility gating, exposing user choice alone just moves the failure from an implicit default to a user-selectable invalid combination.

Selection-time validation should block obviously invalid combinations such as `xhigh` for `openai/gpt-5-mini`. That catches the known failure class earlier.

But setup-time validation alone is not enough:

- provider-specific constraints can drift over time
- OpenRouter `/models` is useful for model discovery, but not a reliable source of allowed `reasoning.effort` enum values
- runtime clamping and retry still need to exist as a second safety layer

Decision on `none`:

- keep `none` as an advanced-only option, not part of the first setup flow
- the first-run menu should focus on `low|medium|high`-style tradeoffs users can understand quickly
- advanced users can still reach `none` through explicit config or a future advanced flag path

Impacted code files:

- `lib/deploy.sh` — the setup wizard logic lives here today, so the OpenRouter `/models` fetch, provider-first model picker, reasoning prompt, validation, persistence, and deploy summary all have to start here.
- `templates/entrypoint.sh` — if setup persists reasoning via env, this file must bridge that value into the deployed Hermes runtime on every boot.
- `tests/deploy.bats` — the interactive setup flow, summary output, and model-selection behavior are covered here and need regression coverage.
- `tests/mocks/curl` — dynamic OpenRouter model-list fetching and key validation need stable mocked API responses in tests.
- `tests/scaffold.bats` — entrypoint env-to-runtime bridging is covered here, so new reasoning persistence needs matching tests.

## Plan of record

### Workstream 1: Build a compatibility source of truth

Goal:

- determine which reasoning effort levels are safe for which model families and provider paths

Plan:

1. Start with a conservative compatibility registry owned by Hermes, not OpenRouter docs alone.

Initial policy:

- unknown model family -> default `medium`
- `xhigh` is opt-in only for explicitly allowlisted model families
- GPT-5 mini must not expose `xhigh`

2. Use OpenRouter `/models` metadata only as an input, not as the source of truth.

Reason:

- it may expose `supported_parameters`
- it may not expose enum-level constraints for `reasoning.effort`

3. Normalize by model family, not by one exact dated snapshot string only.

Examples:

- `openai/gpt-5-mini`
- `openai/gpt-5`
- `openai/gpt-5-nano`
- codex variants
- other reasoning-capable families discovered during follow-up

4. Document unknown families explicitly as unknown, not safe-by-default.

Deliverable:

- a canonical machine-readable compatibility registry in Hermes Agent
- a versioned exported snapshot of that registry consumed by `hermes-fly` releases
- the registry version recorded alongside the pinned Hermes Agent ref in deploy provenance

Long-term ownership decision:

- Hermes Agent should own the canonical compatibility registry
- `hermes-fly` should consume a versioned exported snapshot of that registry for setup-time validation

Reason:

- the runtime is the final enforcement point, so it must own the source of truth
- `hermes-fly` needs the same policy at setup time, but should not maintain a divergent fork
- a versioned exported snapshot preserves reproducibility for a given `hermes-fly` release

Impacted code files:

- `lib/deploy.sh` — setup needs a model-family normalization and compatibility lookup path before it can decide which reasoning options are safe to show.
- `templates/entrypoint.sh` — if the policy version or resolved effective effort is surfaced at runtime, this file has to carry that metadata into the container.
- `lib/docker-helpers.sh` — if the compatibility artifact is bundled into the build context or versioned with the image, Dockerfile generation has to know about it.
- `templates/Dockerfile.template` — if the policy ships in-image rather than only in setup-time shell logic, this template is where that artifact gets copied or labeled.
- `tests/deploy.bats` — compatibility lookup, normalization, and conservative fallback behavior need focused regression tests.
- `tests/docker-helpers.bats` — if policy data becomes part of the image build, Dockerfile generation needs explicit coverage.

### Workstream 2: Add reasoning-effort choice to hermes-fly setup

Goal:

- let the user choose reasoning effort safely during deploy setup

Plan:

1. Replace the static OpenRouter model table with a live provider-first picker backed by `https://openrouter.ai/api/v1/models`.

Flow:

- validate the OpenRouter API key first
- fetch the model list from `/api/v1/models`
- ignore entries that do not contain a parseable `id`
- deduplicate exact model IDs before presenting choices
- derive provider groups from the fetched model IDs
- sort provider groups alphabetically for deterministic menus
- sort models within each provider by display name, then by exact model ID
- ask the user to choose a provider first
- then show the fetched models for that provider
- keep a manual model-ID escape hatch for exact IDs or API-edge cases
- if `/models` fetch fails or returns no parseable model IDs, warn clearly and fall back to manual model-ID entry only

2. After model selection, add a reasoning-effort step.

Prompt intent:

- plain language
- focused on latency/cost/quality tradeoff
- default `medium`

3. Gate options by compatibility policy.

Rules:

- if selected model is known-safe only for `minimal|low|medium|high`, do not show `xhigh`
- if selected model is known-safe only for a smaller subset, show that subset
- if selected model compatibility is unknown, choose conservative behavior:
  - default `medium`
  - optionally hide advanced choices
- keep `none` out of the default first-run menu even when the runtime supports it

Selection-time validation rule:

- block obviously invalid combinations at selection time, for example `xhigh` for `openai/gpt-5-mini`

Constraint:

- setup-time validation reduces known failures early, but it cannot guarantee correctness against every live OpenRouter backend route
- runtime clamping and retry remain required even after setup validation exists

4. Persist the selected value in a way Hermes Agent actually reads.

Candidate persistence targets:

- `HERMES_REASONING_EFFORT` env var
- `agent.reasoning_effort` in `config.yaml`

Preference:

- use the env var first, because Hermes Agent already reads it directly and it is easy to set from Fly secrets
- implementation instruction:
  - add `HERMES_REASONING_EFFORT=${DEPLOY_REASONING_EFFORT}` to the Fly secrets path in `lib/deploy.sh`
  - add `HERMES_REASONING_EFFORT` to the env bridge loop in `templates/entrypoint.sh`
  - do not patch `config.yaml` from `hermes-fly` by default; keep it as runtime/user fallback only

5. Surface the chosen reasoning effort in the deployment summary.

Reason:

- users need to know the effective setting that will impact cost and latency

Impacted code files:

- `lib/deploy.sh` — this is where the OpenRouter model fetch, provider-first picker, reasoning prompt, deploy summary, and Fly secret population already live, so the new setup flow belongs here.
- `templates/entrypoint.sh` — the chosen value has to be bridged into `/root/.hermes/.env` and, if needed, `config.yaml` so Hermes Agent actually sees it.
- `tests/deploy.bats` — add coverage for provider selection, fetched model menus, allowed reasoning-option menus, default selection, summary output, and persistence into deploy state.
- `tests/mocks/curl` — add stable fixtures for `/api/v1/models` and any provider-group filtering scenarios exercised by the wizard.
- `tests/scaffold.bats` — add coverage that the deployed container receives the selected reasoning value correctly on boot.

### Workstream 3: Make hermes-agent runtime-safe even if setup is wrong

Goal:

- prevent one bad model/effort combination from taking down the deployed bot

Plan:

1. Clamp reasoning effort before request send.

Behavior:

- if requested effort exceeds the compatibility policy for the selected model, downgrade automatically
- use a deterministic downgrade ladder:
  - `xhigh -> high -> medium -> low -> minimal`
- for unknown model families, clamp directly to `medium`
- never auto-downgrade to `none`

2. Add a recovery path for provider 400 `unsupported_value` on `reasoning.effort`.

Behavior:

- retry once with a downgraded effort
- log the downgrade clearly
- avoid infinite retry loops
- if the first retry still returns `unsupported_value`, surface the error instead of continuing to step down blindly

3. Keep default behavior conservative for unknown model families.

Behavior:

- use `medium`
- never auto-upgrade to `xhigh` without explicit allowlisting

Important boundary:

- setup-time validation should prevent the known bad combinations before deploy
- runtime safeguards still must exist because live provider/backend behavior can drift after setup

Impacted code files:

- `templates/entrypoint.sh` — this repo still has to guarantee that any setup-selected effort reaches Hermes Agent consistently, otherwise runtime safeguards may not see the intended input.
- `tests/scaffold.bats` — local coverage should verify the runtime env/config handoff stays stable while Hermes Agent-side safeguards are added.
- `https://github.com/NousResearch/hermes-agent/blob/main/gateway/run.py` — this is the most likely request-send path for clamping invalid effort and retrying once on provider `unsupported_value` errors.
- `https://github.com/NousResearch/hermes-agent/blob/main/run_agent.py` — runtime config normalization and defaulting behavior likely needs to understand model-family compatibility here as well.
- `https://github.com/NousResearch/hermes-agent/blob/main/cli.py` — validation and user-facing config handling may need to reject or normalize unsupported reasoning values earlier.
- `https://github.com/NousResearch/hermes-agent/blob/main/cli-config.yaml.example` — documented defaults and generated config examples need to stay aligned with the new runtime safety rules.

### Workstream 4: Expand test coverage

Goal:

- prevent future regressions across both setup and runtime

Plan:

1. hermes-fly tests:

- selected model -> allowed reasoning-effort menu
- risky model -> no `xhigh` option
- unknown model -> conservative fallback
- deployment summary shows effective reasoning effort
- `/models` fetch failure -> manual-entry-only fallback
- malformed or duplicate `/models` entries are ignored deterministically
- provider groups and model ordering are stable

2. hermes-agent tests:

- GPT-5 mini rejects `xhigh` but succeeds with downgraded effort
- known allowlisted model keeps `xhigh`
- unknown family defaults to `medium`
- provider 400 retry path works exactly once
- downgrade ladder stops after one retry and does not auto-drop to `none`

3. end-to-end smoke coverage:

- deploy with a GPT-5 family model
- send one real chat message
- verify no `unsupported_value` failure on reasoning effort

Impacted code files:

- `tests/deploy.bats` — wizard-side compatibility gating, defaulting, and summary coverage belong here.
- `tests/scaffold.bats` — runtime env/config bridging coverage belongs here.
- `tests/docker-helpers.bats` — any image-level policy or pinning changes need build-context coverage here.
- `tests/doctor.bats` — if provenance and drift checks are added, diagnostics coverage belongs here.
- `tests/integration.bats` — end-to-end deploy/install behavior is the natural place for release-channel and provenance smoke coverage in this repo.
- `https://github.com/NousResearch/hermes-agent/blob/main/gateway/run.py` — Hermes Agent request-building changes should ship with matching runtime tests in that repo near the send path.
- `https://github.com/NousResearch/hermes-agent/blob/main/run_agent.py` — config normalization/defaulting changes should ship with matching tests in that repo near the config-loading path.

### Workstream 5: Make Hermes Agent pinning explicit

Goal:

- remove ambiguity and improve release reproducibility for Hermes Agent runtime behavior

Current confirmed behavior:

- `hermes-fly deploy` installs Hermes Agent from upstream `main`

Plan:

1. Make the policy explicit in code and docs.

Two viable product modes:

- track `main` intentionally
- pin a specific Hermes Agent commit/tag per `hermes-fly` release

2. Prefer reproducible pinning unless there is a strong product reason not to.

Preferred behavior:

- each `hermes-fly` release records the exact Hermes Agent ref it installs
- deploys from the same `hermes-fly` release produce the same upstream runtime by default

3. If tracking `main` is retained, document the tradeoff explicitly.

Required docs:

- deploys may change behavior over time without a new `hermes-fly` release
- incident analysis must be anchored to deploy date, not just release version

4. Add verification coverage for the chosen policy.

Examples:

- if pinned: test generated Dockerfile contains the exact expected ref
- if tracking `main`: test generated Dockerfile contains `main` intentionally and docs say so

Impacted code files:

- `lib/deploy.sh` — this is where `hermes-fly deploy` currently hardcodes `"main"`, passes the upstream ref into the build, and writes deploy summary metadata, so pinning and provenance both have to change here.
- `lib/docker-helpers.sh` — Dockerfile generation needs to accept and render an explicit upstream ref instead of an implicit moving target.
- `templates/Dockerfile.template` — the install URL and any image labels/provenance fields depend on the chosen Hermes Agent ref here.
- `lib/doctor.sh` — diagnostics should report the expected ref versus the live ref so drift is visible after deploy.
- `scripts/install.sh` — installer semantics should stay consistent with the product’s release/pinning story instead of silently following a different channel.
- `hermes-fly` — if channel or upstream-ref behavior becomes user-facing, version/help output needs to describe it accurately.
- `tests/docker-helpers.bats` — validate the generated Dockerfile contains the intended upstream ref.
- `tests/deploy.bats` — validate deploy summaries and local metadata capture the intended ref/channel.
- `tests/doctor.bats` — validate drift/provenance reporting once doctor grows ref-awareness.
- `tests/install.bats` — validate installer channel/version behavior stays aligned with the chosen release policy.
- `tests/integration.bats` — validate the default end-to-end install/deploy path uses the intended pinned channel.

### Workstream 6: General reproducibility and stability strategy

Goal:

- make deploy behavior explainable, repeatable, and supportable over time

This workstream is broader than the GPT-5 mini issue. It treats reproducibility and stability as product properties across:

- build inputs
- runtime behavior
- release process
- incident response

Plan:

1. Define deterministic deployment inputs.

Default target state:

- a `hermes-fly` release should resolve to a stable set of inputs:
  - `hermes_fly_version`
  - `hermes_agent_ref`
  - compatibility policy version
  - default runtime policy version
  - template revision

Preferred behavior:

- the default release channel is pinned and reproducible
- moving targets such as upstream `main` are only used in explicit preview/edge modes

2. Introduce explicit release channels.

Chosen user-facing policy:

- `stable`: pinned upstream refs, default for normal users
- `preview`: opt-in channel for users who explicitly want broader pre-release testing
- `edge`: intentionally tracks moving upstream refs such as `main`, but stays out of the standard interactive wizard

Why:

- it separates "I want predictability" from "I want the newest upstream bits"
- it lets incidents be triaged against a known policy instead of an implicit moving target

UX policy:

- standard `hermes-fly deploy` should use `stable` by default without adding one more question for normal users
- `preview` should be available through an explicit advanced flag or environment variable
- `edge` should be expert-only, clearly marked as non-reproducible, and omitted from the first-run wizard
- implement channel selection as explicit advanced input, not an interactive first-run question

3. Record deployment provenance locally and in the deployed app.

Current foundation:

- `deploy_write_summary()` already writes deploy YAML and Markdown locally

Relevant local ref:

- `lib/deploy.sh:1109-1138`

Extend it to capture:

- `hermes_agent_ref`
- deploy channel (`stable` / `preview` / `edge`)
- compatibility policy version
- selected reasoning effort
- generated Dockerfile source ref
- deploy timestamp

Preferred behavior:

- the same provenance data is also available inside the deployed app, either:
  - as env vars
  - or as a runtime manifest file under `/root/.hermes/`

Why:

- incident response should not depend on reconstructing build inputs from memory
- support should be able to answer "what exactly is running?" from the app itself

4. Add drift detection.

Desired checks:

- local deploy summary matches the intended release manifest
- live app runtime manifest matches the local deploy summary
- doctor command can report when the app is running:
  - an unexpected upstream ref
  - an unexpected deploy channel
  - an unknown compatibility policy version

This prevents "same release name, different runtime" from going unnoticed.

5. Make compatibility data versioned, not ad hoc.

Reasoning compatibility should be treated like versioned product data, not scattered conditionals.

Preferred shape:

- one compatibility registry
- one version number for that registry
- release notes mention when that registry changes materially

Why:

- model/provider behavior changes over time
- incidents should be traceable to a compatibility-policy version, not just code SHA

6. Add staged rollout and rollback practices.

Suggested release discipline:

- release candidate deploy to a canary app
- run smoke tests against the minimum stable matrix below
- only then publish stable release

Minimum smoke-test matrix for promotion to `stable`:

1. OpenRouter + a known restricted model family
   - example: `openai/gpt-5-mini`
   - verify setup does not offer `xhigh`
   - deploy succeeds
   - one real chat round-trip succeeds without `unsupported_value`

2. OpenRouter + a known allowlisted high-effort family
   - verify setup offers the allowlisted high-effort tier
   - deploy succeeds
   - one real chat round-trip succeeds without downgrade loops

3. OpenRouter + an unknown or not-yet-allowlisted family
   - verify setup falls back to the conservative menu
   - deploy succeeds
   - one real chat round-trip succeeds with the conservative default

4. One non-OpenRouter provider sanity deploy
   - example: Nous Portal
   - verify the new setup/runtime changes did not regress a non-OpenRouter path

5. Provenance and drift verification
   - verify the deployed app reports the expected `hermes_agent_ref`, compatibility-policy version, and release channel
   - verify `hermes-fly doctor` reports those values coherently for the canary app

Required rollback path:

- document how to roll back:
  - `hermes-fly` release
  - Hermes Agent ref
  - compatibility policy version

Stability is not just preventing change; it is also making reversal cheap.

7. Make external dependency contracts explicit.

Dependencies whose payloads or semantics can drift:

- OpenRouter `/models`
- Fly.io VM/org APIs
- Telegram Bot API responses
- Hermes Agent install entrypoint

Plan:

- keep fixture coverage for known payload shapes
- add contract tests for the minimum fields Hermes needs
- fail safely when metadata is missing or incomplete

This reduces fragility from upstream schema drift.

8. Prefer conservative defaults when certainty is low.

Default policy:

- unknown model family -> `medium`
- unknown compatibility -> hide advanced options
- unknown upstream ref -> warn loudly
- unknown channel/provenance -> fail closed for stable releases

This is the main stability principle across the system.

Impacted code files:

- `lib/deploy.sh` — release channel choice, provenance capture, compatibility-policy version capture, and deploy summary output all belong here.
- `templates/entrypoint.sh` — runtime manifests or env markers for provenance, channel, effective model, and reasoning settings have to be written here on boot.
- `lib/doctor.sh` — drift detection and operator-facing diagnostics belong here once provenance is part of the product contract.
- `lib/docker-helpers.sh` — deterministic build inputs and image metadata flow through Dockerfile generation here.
- `templates/Dockerfile.template` — pinned upstream refs, release-channel labels, and manifest-copy behavior depend on this template.
- `scripts/install.sh` — installer defaults should align with the same stable/preview/edge policy so install behavior is reproducible too.
- `hermes-fly` — top-level version/help output may need to expose release channel or provenance commands if they become user-facing.
- `tests/deploy.bats` — provenance capture and channel-selection behavior need wizard-side regression coverage.
- `tests/scaffold.bats` — runtime manifest/env writing needs boot-time coverage.
- `tests/doctor.bats` — drift detection and provenance reporting need explicit diagnostics coverage.
- `tests/docker-helpers.bats` — deterministic build-input behavior needs image-generation coverage.
- `tests/install.bats` — installer channel behavior and release resolution need dedicated regression coverage.
- `tests/integration.bats` — stable-vs-preview-vs-edge behavior should be exercised end to end.

## Immediate operational plan

Status on 2026-03-09:

- live verification completed on `hermes-sprite-981`
- confirmed live model: `openai/gpt-5-mini`
- confirmed env source: no `HERMES_REASONING_EFFORT` present
- confirmed config source: `agent.reasoning_effort: "xhigh"` in `/root/.hermes/config.yaml`
- confirmed live Hermes Agent ref: `caab1cf4536f79f5b74552f47360e178e6d28ff9`
- temporary mitigation applied on disk: `reasoning_effort` changed to `medium`

Code-file note:

- No repo code changes are required just to run the live inspection commands below.
- If we later productize these checks, the most directly impacted files would be `lib/doctor.sh`, `templates/entrypoint.sh`, `tests/doctor.bats`, and `tests/scaffold.bats`, because that is where runtime inspection and boot-time provenance would live in this repo.
- One operational lesson from the live run: avoid `python3` + `import yaml` for first-line diagnostics in the current container image, because the `yaml` module is not installed there.

### Live checks

1. Check effective model and reasoning config:

```bash
fly ssh console --app <APP> -C 'sh -lc '"'"'grep -n "^LLM_MODEL=" /root/.hermes/.env; grep -n "^HERMES_REASONING_EFFORT=" /root/.hermes/.env; grep -n "reasoning_effort" /root/.hermes/config.yaml'"'"''
```

2. Dump a safe config snippet without assuming `PyYAML` is installed:

```bash
fly ssh console --app <APP> -C 'sh -lc '"'"'printf "LLM_MODEL_env=%s\n" "${LLM_MODEL-}"; printf "HERMES_REASONING_EFFORT_env=%s\n" "${HERMES_REASONING_EFFORT-}"; grep -n -B 4 -A 4 "reasoning_effort" /root/.hermes/config.yaml'"'"''
```

3. Verify what Hermes Agent source/ref is actually present:

```bash
fly ssh console --app <APP> -C 'sh -lc '"'"'if [ -d /opt/hermes/hermes-agent/.git ]; then git -C /opt/hermes/hermes-agent rev-parse HEAD; else echo "no git metadata"; fi'"'"''
```

### Safe temporary workaround

If the live checks show `xhigh`, clamp it to `medium` immediately:

```bash
fly ssh console --app <APP> -C 'sh -lc '"'"'sed -i.bak "s/^  reasoning_effort: \"xhigh\"$/  reasoning_effort: \"medium\"/" /root/.hermes/config.yaml && grep -n "reasoning_effort" /root/.hermes/config.yaml'"'"''
```

Then restart or redeploy if Hermes Agent does not reload config dynamically.

## Decision log

The following questions have enough evidence for plan-level decisions and should be treated as resolved unless new contrary evidence appears:

1. Which code path originally wrote `reasoning_effort: "xhigh"` into the deployed `config.yaml`?
  - **Finding** [HIGH]: The deployed Hermes Agent commit `caab1cf` had `_load_reasoning_config()` defaulting to `xhigh` when no explicit config was set (docstring: "Returns None to use default (xhigh)"). The example config says `medium`, but the gateway runtime in that commit treated absence of config as `xhigh`. Upstream `main` has since changed the default to `medium`. ([source](https://raw.githubusercontent.com/NousResearch/hermes-agent/caab1cf4536f79f5b74552f47360e178e6d28ff9/gateway/run.py)). **Recommendation**: Mark as resolved; the root cause is the commit-level Hermes Agent default, now fixed upstream.
2. Does OpenRouter `/models` expose enough metadata to safely derive allowed effort values, or do we need a Hermes-maintained compatibility registry?
  - **Finding** [HIGH]: OpenRouter `/models` lists `supported_parameters` as parameter names but does NOT expose enum-level constraints for `reasoning.effort` values. It cannot tell you whether `xhigh` is valid for a specific model. OpenRouter maps effort to token ratios internally but provides no per-model effort enumeration. ([OpenRouter Models API](https://openrouter.ai/docs/api/api-reference/models/get-models), [OpenRouter Reasoning Tokens](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)). **Recommendation**: A Hermes-maintained compatibility registry is required; the API is useful for discovery but insufficient for effort-level gating.
3. Should `hermes-fly` persist user choice via `HERMES_REASONING_EFFORT`, `config.yaml`, or both?
  - **Finding** [HIGH]: Hermes Agent checks `HERMES_REASONING_EFFORT` env var first with highest priority, then falls back to `config.yaml`. Current entrypoint.sh bridges Fly secrets for other vars but NOT for `HERMES_REASONING_EFFORT`. The env var path via Fly secrets is cleanest: matches existing OPENROUTER_API_KEY/LLM_MODEL pattern, avoids fragile sed-based YAML patching. ([Hermes Agent gateway/run.py](https://raw.githubusercontent.com/NousResearch/hermes-agent/main/gateway/run.py)). **Recommendation**: Use `HERMES_REASONING_EFFORT` env var via Fly secrets as the primary path; add to entrypoint.sh bridge loop. Config.yaml remains user-editable fallback only.
4. Should `none` be exposed in the first setup UX, or only as an advanced option?
  - **Finding** [MEDIUM]: `none` is a valid runtime value, but it is harder to explain well in a short beginner-oriented prompt than `low|medium|high`. It also changes behavior more sharply than the normal “more thinking vs less thinking” tradeoff, which makes it easy to misuse in a first-run wizard. **Recommendation**: Keep `none` out of the default setup flow and reserve it for advanced configuration only.
5. Which model families besides GPT-5 variants have per-model or per-provider reasoning-effort restrictions?
  - **Finding** [MEDIUM]: GPT-5 series has per-model restrictions (GPT-5/GPT-5-mini: minimal/low/medium/high; GPT-5.2+: adds xhigh). Anthropic Claude uses a different system entirely (budget_tokens / adaptive thinking effort). Google Gemini 3 uses thinkingLevel (LOW/HIGH for 3.0; LOW/MEDIUM/HIGH for 3.1). OpenRouter maps effort to token ratios for non-native models but cannot prevent upstream rejections. ([OpenRouter Reasoning](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens), [OpenAI GPT-5 Community Matrix](https://community.openai.com/t/request-for-compatibility-matrix-reasoning-effort-sampling-parameters-across-gpt-5-series/1371738)). **Recommendation**: Registry should cover GPT-5 family (per-model), Anthropic (different param), Gemini (thinkingLevel), with conservative defaults for unknowns.
6. Should `hermes-fly` keep tracking Hermes Agent `main` at deploy time, or pin an explicit upstream commit/tag per `hermes-fly` release?
  - **Finding** [HIGH]: The xhigh incident itself proves the risk of tracking main: commit caab1cf defaulted to xhigh while current main uses medium. Same hermes-fly release produced different runtime behavior. Helm and SLSA provenance best practices strongly recommend pinning dependency versions for reproducibility, with opt-in channels for moving targets. ([Docker SLSA Provenance](https://docs.docker.com/build/metadata/attestations/slsa-provenance/), [Helm Dependencies](https://helm.sh/docs/chart_best_practices/dependencies/)). **Recommendation**: Pin explicit Hermes Agent ref per hermes-fly release for stable channel; offer opt-in edge channel for tracking main.
7. What exact release-channel policy should be user-facing: only `stable`, or `stable` plus opt-in `preview` / `edge`?
  - **Finding** [HIGH]: There are two conflicting needs: reproducibility for normal users and a path for testing newer upstream behavior before stable promotion. A single visible channel is too rigid, but putting `preview` and `edge` in the main wizard would overcomplicate the default path and invite accidental use of unstable inputs. **Recommendation**: Make `stable` the default and silent channel in the standard wizard, expose `preview` only through explicit advanced opt-in, and keep `edge` expert-only and out of the first-run UX.
8. Where should deployment provenance live for long-term supportability: local deploy summary only, runtime manifest only, or both?
  - **Finding** [HIGH]: SLSA provenance standards store metadata both in build artifacts and as attached attestations. Manifest-based deployment best practices maintain provenance in version-controlled manifests (local) and deployed artifacts (runtime). This incident required SSH into the live app to determine the running commit -- a runtime manifest would have made this trivial. ([Docker SLSA Provenance](https://docs.docker.com/build/metadata/attestations/slsa-provenance/), [Red Hat Reproducible Builds](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/10/html/building_running_and_managing_containers/introduction-to-reproducible-container-builds)). **Recommendation**: Both. Local deploy summary for release-to-deploy correlation; runtime manifest (e.g., /root/.hermes/deploy-manifest.json) for in-app inspection.
9. Which repo should own the compatibility registry long-term: `hermes-fly`, `hermes-agent`, or a shared artifact consumed by both?
  - **Finding** [HIGH]: The runtime must enforce the same compatibility policy that setup uses, so long-term ownership belongs closest to the runtime. Putting the canonical registry only in `hermes-fly` would make the safety-critical enforcement path depend on a second repo copying logic correctly. **Recommendation**: Hermes Agent should own the canonical registry; `hermes-fly` should consume a versioned exported artifact from Hermes Agent for setup-time gating.
10. What minimum smoke-test matrix is required before promoting a release to `stable`?
  - **Finding** [HIGH]: A single “one model family” smoke test is too weak for this problem class because it would miss the difference between restricted models, allowlisted high-effort models, unknown families, and non-OpenRouter regressions. **Recommendation**: Require a minimum matrix of: one restricted OpenRouter family, one allowlisted high-effort OpenRouter family, one unknown/not-yet-allowlisted OpenRouter family, one non-OpenRouter sanity deploy, and one provenance/drift verification pass.

## Remaining open questions

These still require follow-up before implementation is fully locked:

1. What exact registry export format should Hermes Agent publish for `hermes-fly` consumption: checked-in data file, generated release artifact, or both?
2. Which exact model families and provider-path overrides belong in the first shipped compatibility registry beyond the already confirmed GPT-5 constraints?
3. What exact advanced CLI surface should expose non-default channels and advanced reasoning options: flags, env vars, or both?

## Bottom line

This is not just a GPT-5 mini one-off.

The confirmed failure is GPT-5 mini, but the underlying product gap is broader:

- `hermes-fly` currently uses a static OpenRouter model table, which is too limited for broad provider/model coverage
- the planned move to OpenRouter `/models` must not assume "model appears in `/models`" means "safe with Hermes runtime defaults"
- that assumption is too weak for reasoning-capable models with model-specific or provider-specific effort limits

The plan is therefore:

- fetch OpenRouter models dynamically and present them in a provider-first picker
- let the user choose reasoning effort during setup
- validate the choice at selection time against model-aware compatibility
- add runtime clamping and retry in Hermes Agent
- keep unknown cases conservative
- leave the unresolved parts explicitly open until they are proven

---

## References

- [OpenRouter List Models API docs](https://openrouter.ai/docs/api/api-reference/models/get-models)
- [OpenRouter Reasoning Tokens docs](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)
- [OpenRouter API Parameters docs](https://openrouter.ai/docs/api/reference/parameters)
- [OpenAI GPT-5 Series Compatibility Matrix (community)](https://community.openai.com/t/request-for-compatibility-matrix-reasoning-effort-sampling-parameters-across-gpt-5-series/1371738)
- [OpenAI GPT-5.2 Model docs](https://platform.openai.com/docs/models/gpt-5.2)
- [OpenAI GPT-5 Model docs](https://platform.openai.com/docs/models/gpt-5)
- [Azure OpenAI Reasoning Models docs](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/reasoning)
- [VS Code xhigh reasoning effort issue](https://github.com/microsoft/vscode/issues/281371)
- [Anthropic Extended Thinking docs](https://platform.claude.com/docs/en/build-with-claude/extended-thinking)
- [Anthropic Adaptive Thinking docs](https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking)
- [Google Gemini Thinking docs](https://ai.google.dev/gemini-api/docs/thinking)
- [Hermes Agent gateway/run.py (main)](https://raw.githubusercontent.com/NousResearch/hermes-agent/main/gateway/run.py)
- [Hermes Agent gateway/run.py (failing commit)](https://raw.githubusercontent.com/NousResearch/hermes-agent/caab1cf4536f79f5b74552f47360e178e6d28ff9/gateway/run.py)
- [Hermes Agent cli-config.yaml.example](https://raw.githubusercontent.com/NousResearch/hermes-agent/main/cli-config.yaml.example)
- [Docker SLSA Provenance Attestations](https://docs.docker.com/build/metadata/attestations/slsa-provenance/)
- [Helm Dependency Best Practices](https://helm.sh/docs/chart_best_practices/dependencies/)
- [Red Hat Reproducible Container Builds](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/10/html/building_running_and_managing_containers/introduction-to-reproducible-container-builds)
