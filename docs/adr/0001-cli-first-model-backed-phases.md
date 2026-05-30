# Use Codex CLI for model-backed phases

Sandcastle automation uses Codex CLI for every model-backed phase: planner, implementer, reviewer, and merger. We do not silently fall back to model-provider API key usage because the goal is to align coding-agent execution with the user's Codex/ChatGPT plan and make cost-affecting failures explicit.

## Consequences

If Codex CLI authentication, limits, or sandbox access fail, the automation stops and reports an explicit CLI failure. GitHub access through `GH_TOKEN` remains allowed as operational API access.

The runner has a preflight gate, configurable `CODEX_MODEL`, `CODEX_EFFORT`, and `MAX_PARALLEL_ISSUES` values, and rejects model-provider API key variables. Docker remains the normal sandbox mode; each sandbox receives read-only Codex login files while keeping writable Codex run state isolated.
