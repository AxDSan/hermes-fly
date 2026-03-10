# PR 2 Plan: Reasoning Effort UX + Compatibility Gating + Persistence

Date: 2026-03-10
Scope: `hermes-fly` repo implementation with explicit Hermes Agent upstream dependencies
Status: Ready for implementation

## Problem

The confirmed production failure was not model alias rejection; it was an invalid `reasoning.effort` value for the selected model path. Setup must let users choose reasoning effort safely, block known-invalid combinations, and persist the chosen value in a path Hermes Agent actually reads.

## Confirmed baseline

From the source investigation (`openrouter-gpt5-mini-reasoning-triage-20260309.md`):

- Confirmed failing pattern:
  - deployed runtime sent `reasoning.effort=xhigh`
  - provider rejected it for GPT-5 mini
  - supported values were `minimal|low|medium|high`
  - provider metadata in failing error path was `Azure`
  - failing snapshot example in investigation: `gpt-5-mini-2025-08-07`
- Confirmed live app state on 2026-03-09:
  - `/root/.hermes/.env` had `LLM_MODEL=openai/gpt-5-mini`
  - `/root/.hermes/.env` did not have `HERMES_REASONING_EFFORT`
  - `/root/.hermes/config.yaml` had `reasoning_effort: "xhigh"`
- Hermes Agent behavior (confirmed in source doc references):
  - accepted values include `xhigh|high|medium|low|minimal|none`
  - reads env `HERMES_REASONING_EFFORT` and config `agent.reasoning_effort` in `~/.hermes/config.yaml`
  - current upstream `main` default is `medium`
  - upstream config example includes `agent.reasoning_effort: "medium"`
- Decision-log root-cause finding:
  - failing commit `caab1cf4536f79f5b74552f47360e178e6d28ff9` defaulted reasoning to `xhigh` when not explicitly set
  - function-level source was `_load_reasoning_config()` in that commit path, where absence of explicit value could resolve to `xhigh`
- Provider docs mismatch confirmed:
  - OpenRouter reasoning docs discuss GPT-5-series reasoning broadly (including `xhigh`)
  - OpenAI/Azure GPT-5 mini docs constrain to `minimal|low|medium|high`
  - OpenRouter `/models` (`/api/v1/models`) exposes parameter names (for example `supported_parameters`, `default_parameters`), not model-specific effort-enum safety
- `hermes-fly` itself has no literal `xhigh`; failure came from runtime config/default behavior.
- In the inspected failing app, runtime source detail was:
  - `agent.reasoning_effort: "xhigh"` in deployed config
  - not `HERMES_REASONING_EFFORT` from runtime env

## Product decisions carried into this PR

1. Setup asks for reasoning effort after model selection.
2. Choice is constrained by compatibility policy, not free-form input.
3. Conservative defaults when compatibility is unknown:
- default to `medium`
- hide advanced options or show conservative subset only
4. `none` is advanced-only and not shown in first-run wizard.
5. Persistence uses `HERMES_REASONING_EFFORT` env var as primary path.
6. `config.yaml` is not patched by default from `hermes-fly`; keep it as runtime/user fallback.

## Scope in this PR

1. Add reasoning-effort step to setup flow.
2. Implement setup-time compatibility lookup and option gating.
3. Block known-invalid combinations at selection time (example: GPT-5 mini + `xhigh`).
4. Persist selected value into Fly secrets as `HERMES_REASONING_EFFORT`.
5. Bridge that env var into runtime env in `templates/entrypoint.sh`.
6. Show effective selected reasoning effort in deploy summary.
7. Ship full regression tests in this repo.

## Out of scope (explicitly not in this PR)

- Runtime clamping and one-retry `unsupported_value` fallback in Hermes Agent code.
- Canonical compatibility-registry authoring inside Hermes Agent.
- Release-channel policy and drift detection.

## What remains unconfirmed (carried forward from source analysis)

1. Full code-path provenance for how `reasoning_effort: "xhigh"` was first written in every historical failing deploy (resolved for one inspected commit, not exhaustively for all timelines).
2. Whether OpenRouter metadata can ever provide complete enum-level compatibility for all model/provider paths.
3. Whether compatibility varies by effective backend route under OpenRouter (`OpenAI-served`, `Azure-served`, others) for the same logical model alias.
4. How much compatibility behavior can vary by Hermes Agent commit when deploy inputs track moving upstream refs.

## Scope status carried forward

This split PR plan preserves the original scope framing:

- fully covers:
  - confirmed GPT-5 mini failure class
  - `hermes-fly` setup reasoning-choice/product gap
  - compatibility-gated setup behavior and persistence path in this repo
- does not yet fully cover:
  - exhaustive all-model/all-provider compatibility matrix
  - exhaustive proof for every historical `xhigh` write path beyond resolved inspected commit evidence
  - complete backend-route variance matrix under OpenRouter
- practical interpretation:
  - one concrete failure was deeply investigated
  - strategy is generalized to the broader class
  - unresolved points remain explicitly open pending proof

## Compatibility policy model for setup

### Initial policy requirements

- unknown model family -> `medium`
- `xhigh` only for explicit allowlist families
- GPT-5 mini must not expose `xhigh`
- never auto-surface `none` in first-run menu

### Policy source-of-truth direction

Long-term decision retained from source plan:

- Hermes Agent owns canonical machine-readable compatibility registry
- `hermes-fly` consumes a versioned exported snapshot for setup gating

Short-term implementation in this PR (repo-local):

- consume a bundled versioned snapshot artifact suitable for deterministic setup behavior
- do not infer effort enum safety directly from OpenRouter `/models`

### Cross-family notes from resolved decision log

These details remain relevant when defining first-release policy data:

- GPT-5 family is not uniform:
  - `openai/gpt-5-mini` observed limits: `minimal|low|medium|high`
  - `openai/gpt-5` observed limits: `minimal|low|medium|high` in referenced docs
  - `openai/gpt-5-nano` should remain explicit in registry modeling, not assumed identical by name similarity alone
  - GPT-5/GPT-5-mini observed limits: `minimal|low|medium|high`
  - newer GPT-5.* variants may include broader tiers depending on model/provider
- Anthropic reasoning behavior uses different thinking controls (not a direct `reasoning.effort` match).
- Google Gemini thinking controls use provider-specific levels (`minimal|low|medium|high` via `thinkingLevel`, variants by model generation).
- Compatibility policy must remain family-aware and provider-aware, with conservative fallback for unknowns.

## Detailed setup behavior

1. Model selected (from OpenRouter picker path).
2. Normalize model to family key.
3. Resolve allowed efforts from compatibility snapshot.
4. Render prompt with only allowed first-run options.
5. Default selection to `medium` when present; otherwise safest allowed value.
6. On unknown family:
- default to `medium`
- optionally hide menu and continue with `medium`
7. Persist selected effort to deploy state.
8. Export to Fly secrets as `HERMES_REASONING_EFFORT`.
9. Include effective effort in deploy summary output.

## File-level implementation plan

- `lib/deploy.sh`
  - add reasoning-effort prompt step after model selection
  - add compatibility lookup/validation helpers
  - write `HERMES_REASONING_EFFORT=${DEPLOY_REASONING_EFFORT}` in secrets flow
  - include effective reasoning effort in summary YAML/markdown
- `templates/entrypoint.sh`
  - add `HERMES_REASONING_EFFORT` to env bridge loop into `/root/.hermes/.env`
  - avoid direct YAML patching for reasoning by default
- `tests/deploy.bats`
  - selected model -> expected allowed options
  - risky model excludes `xhigh`
  - unknown model conservative fallback
  - summary contains effective effort
  - invalid combination blocked at selection time
- `tests/scaffold.bats`
  - runtime env bridge includes `HERMES_REASONING_EFFORT`
- `tests/mocks/curl`
  - fixtures for model families used by gating tests

## Upstream dependency notes (Hermes Agent)

These are required for end-to-end resilience but are dependency-only for this repo PR:

1. Pre-send clamp by model family:
- downgrade ladder `xhigh -> high -> medium -> low -> minimal`
- unknown family clamp directly to `medium`
- never auto-downgrade to `none`

2. Recovery for provider 400 `unsupported_value`:
- retry once with downgraded effort
- log downgrade
- no retry loops
- if retry fails again, surface error

3. Runtime defaults:
- unknown family remains conservative
- no auto-upgrade to `xhigh` without allowlist

Hermes Agent test expectations (dependency-only, from source Workstream 4):

- GPT-5 mini rejects `xhigh` path but succeeds with downgraded effort.
- known allowlisted model keeps high-effort tier where explicitly allowed.
- unknown family defaults to `medium`.
- provider 400 retry path runs once only.
- downgrade ladder does not auto-drop to `none`.

## Test plan for this PR

1. Wizard gating tests (`tests/deploy.bats`):
- GPT-5 mini family does not show `xhigh`
- allowlisted family shows allowed higher tier(s)
- unknown family falls back conservatively
- invalid manual effort input rejected

2. Persistence tests:
- Fly secrets include `HERMES_REASONING_EFFORT`
- deploy summary records chosen effort
- entrypoint bridge writes value into runtime env

3. Regression tests:
- non-OpenRouter provider flows unchanged
- manual model-ID path still supports conservative fallback behavior

## Risk assessment

- Risk: policy snapshot drifts from Hermes Agent runtime behavior.
- Mitigation: version policy artifact and record version in deploy outputs.

- Risk: users expect `none` in setup.
- Mitigation: document as advanced-only path and keep first-run UI simple.

- Risk: setup validation gives false confidence if provider behavior changes.
- Mitigation: keep upstream runtime clamp/retry as explicit dependency.

## Resolved decision items captured here

- `/models` metadata is insufficient for effort enum safety by itself.
- Persistence should use env var first (`HERMES_REASONING_EFFORT`).
- `none` should be advanced-only in first-run UX.
- Compatibility registry ownership belongs to Hermes Agent long term.

## Remaining open questions (still unresolved)

1. Exact registry export format from Hermes Agent to `hermes-fly`.
2. Exact first-release family list and provider-path overrides beyond confirmed GPT-5 constraints.
3. Whether setup should treat some provider routes under one model alias as distinct compatibility targets from day one.
4. Whether family-level policy should encode explicit OpenAI-served vs Azure-served overrides at first ship.

## Acceptance criteria

- Setup includes a reasoning-effort step with model-aware gated options.
- Known-invalid combinations are blocked before deploy.
- Chosen effort is persisted via env var path that Hermes Agent reads.
- Deploy summary surfaces effective reasoning effort.
- Tests cover gating, defaults, persistence, and runtime env bridging.
- Runtime clamp/retry remains documented as upstream dependency.

## Bottom-line carry-forward

- this is not only a GPT-5 mini one-off
- dynamic `/models` discovery must not be treated as enum-level safety proof
- setup gating plus conservative defaults are required in `hermes-fly`
- runtime clamping/retry remains mandatory upstream in Hermes Agent
- unresolved questions stay explicit until validated

## Literal artifacts preserved from source

To keep exact source fidelity for implementation and grep-based traceability, these literals are intentionally retained:

- `gpt-5-mini`
- `reasoning_effort`
- `reasoning_effort: "medium"`
- `https://github.com/NousResearch/hermes-agent/blob/main/cli.py`
- `https://github.com/NousResearch/hermes-agent/blob/main/gateway/run.py`
- `https://github.com/NousResearch/hermes-agent/blob/main/run_agent.py`
- `https://github.com/NousResearch/hermes-agent/blob/main/cli-config.yaml.example`

## References

- `openrouter-gpt5-mini-reasoning-triage-20260309.md`
- [OpenRouter Models API reference](https://openrouter.ai/docs/api/api-reference/models/get-models)
- https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
- [OpenAI GPT-5 model page](https://platform.openai.com/docs/models/gpt-5)
- [OpenAI GPT-5 mini model page](https://platform.openai.com/docs/models/gpt-5-mini)
- https://platform.openai.com/docs/models/gpt-5.2
- [Azure OpenAI reasoning models documentation](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/reasoning)
- [OpenAI reasoning models guide](https://developers.openai.com/api/docs/guides/reasoning/)
- https://community.openai.com/t/request-for-compatibility-matrix-reasoning-effort-sampling-parameters-across-gpt-5-series/1371738
- [VS Code xhigh reasoning effort issue](https://github.com/microsoft/vscode/issues/281371)
- [Anthropic Claude extended thinking docs](https://platform.claude.com/docs/en/build-with-claude/extended-thinking)
- [Anthropic Claude adaptive thinking docs](https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking)
- [Google Gemini Thinking API docs](https://ai.google.dev/gemini-api/docs/thinking)
- https://github.com/NousResearch/hermes-agent/blob/main/cli.py#L106-L120
- https://github.com/NousResearch/hermes-agent/blob/main/gateway/run.py#L360-L387
- https://github.com/NousResearch/hermes-agent/blob/main/run_agent.py#L2364-L2375
- https://github.com/NousResearch/hermes-agent/blob/main/cli-config.yaml.example#L345-L348
- https://github.com/NousResearch/hermes-agent/blob/main/scripts/install.sh#L786-L790
- https://raw.githubusercontent.com/NousResearch/hermes-agent/main/gateway/run.py
- https://raw.githubusercontent.com/NousResearch/hermes-agent/caab1cf4536f79f5b74552f47360e178e6d28ff9/gateway/run.py
- https://raw.githubusercontent.com/NousResearch/hermes-agent/main/cli-config.yaml.example
