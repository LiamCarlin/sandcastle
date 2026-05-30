# Sandcastle Automation

This context describes the language for local coding-agent automation built around Sandcastle, Codex CLI, and GitHub-backed work queues.

## Language

**CLI-first agent execution**:
Coding-agent work is performed by invoking a local agent CLI authenticated through the user's existing account, rather than by sending model requests with a model-provider API key.
_Avoid_: no-API mode, pure API-free automation

**Model-provider API key usage**:
Direct use of a model provider's platform API key to run coding-agent model calls.
_Avoid_: API calls, credits

**Operational API access**:
Use of non-model APIs needed to coordinate the workflow, such as GitHub Issues access through `GH_TOKEN`.
_Avoid_: API calls

**Explicit CLI failure**:
A failed Codex CLI authentication, limit, or runtime check stops the automation and reports the reason instead of falling back to model-provider API key usage.
_Avoid_: silent fallback, automatic API fallback

**Model-backed phase**:
A workflow phase that asks an AI coding agent to reason, write, review, or merge code. Planner, implementer, reviewer, and merger are all model-backed phases.
_Avoid_: agent step, AI call

**Sandboxed CLI run**:
CLI-first agent execution performed inside an isolated Sandcastle sandbox, normally Docker, after a preflight confirms the CLI can authenticate there.
_Avoid_: local run, direct run

**Workflow credential**:
A non-model credential required to coordinate automation, such as `GH_TOKEN` for GitHub Issues. Workflow credentials are allowed; model-provider API keys are not part of normal automation.
_Avoid_: API key, provider key

**Preflight gate**:
A required check that proves Codex CLI, sandbox access, mounted CLI credentials, and workflow credentials are usable before any model-backed phase begins.
_Avoid_: smoke test, warning

**Codex login state**:
The local Codex files that prove the user is authenticated. Sandboxed CLI runs may read this state, but parallel runs must not share one writable Codex state directory.
_Avoid_: Codex config, Codex cache

**Parallelism limit**:
The maximum number of issue pipelines allowed to run at the same time during a Sandcastle iteration.
_Avoid_: rate limit, batch size

**Issue run order**:
The deterministic order used to choose which unblocked issues run when the parallelism limit is lower than the number of candidates. The default order is ascending GitHub issue number.
_Avoid_: priority, scheduling

**Planner**:
The model-backed phase that reads open GitHub issues and selects currently unblocked work. The planner returns structured issue candidates so the execution loop can remain deterministic.
_Avoid_: scheduler, queue

**Configured Codex model**:
The Codex CLI model and reasoning effort used by model-backed phases. The default target is Codex 5.5 with medium effort, but the exact CLI model string must remain easy to change.
_Avoid_: hard-coded model, baked-in model

**Automation configuration**:
Editable `.sandcastle/.env` values that tune the automation without code changes, including `CODEX_MODEL`, `CODEX_EFFORT`, `MAX_PARALLEL_ISSUES`, and workflow credentials.
_Avoid_: script constants, magic values

## Example Dialogue

Dev: "Are we removing API calls?"

Domain expert: "We are removing model-provider API key usage for coding-agent work. Operational API access, like GitHub Issues, stays."

Dev: "What happens if Codex CLI is not logged in?"

Domain expert: "That is an explicit CLI failure. The run stops instead of consuming model-provider API credits."

Dev: "Can the planner still use an API key since it only runs once?"

Domain expert: "No. Every model-backed phase uses CLI-first agent execution."

Dev: "Should we run Codex directly on the host to make login easier?"

Domain expert: "No. Normal automation uses a sandboxed CLI run, and preflight catches auth problems before planning starts."

Dev: "Can `.env` still include `OPENAI_KEY=` as a placeholder?"

Domain expert: "No. `.env` should only contain workflow credentials such as `GH_TOKEN`."

Dev: "Can preflight warn and continue?"

Domain expert: "No. The preflight gate aborts before planning if CLI-first agent execution is not ready."

Dev: "Can all parallel agents write to the same `~/.codex` mount?"

Domain expert: "No. Sandboxes can share Codex login state for reading, but each parallel run needs isolated writable state."

Dev: "Can the planner start every unblocked issue at once?"

Domain expert: "No. The parallelism limit keeps Codex plan usage predictable."

Dev: "Which unblocked issues run first?"

Domain expert: "The issue run order is deterministic, starting with the lowest issue number unless a later priority rule is explicitly added."

Dev: "Can planning be pure code?"

Domain expert: "Not yet. The planner stays model-backed until GitHub issues carry explicit dependency metadata."

Dev: "What model should the automation use?"

Domain expert: "Use the configured Codex model: default to Codex 5.5 with medium effort, and make the model string easy to change."

Dev: "What if `gpt-5.5` is not accepted by Codex CLI?"

Domain expert: "Change `CODEX_MODEL` in the automation configuration; the preflight gate should catch invalid model strings before real work starts."
