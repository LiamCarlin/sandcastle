# Use planner diagnostics with least-blocked fallback

Sandcastle planner output includes both runnable issue candidates and planner diagnostics for every input issue. Diagnostics explain whether each issue is `unblocked`, `blocked`, or selected as the `fallback`, and use structured blocker types for dependency reasoning.

When every ready issue is blocked, the planner still returns one least-blocked fallback issue. The fallback is marked in planner output and the fallback reason is handed to the implementer. The implementer proceeds with the assigned issue while using the issue body, dependency markers, and comments to avoid unsafe assumptions.

## Consequences

Planner output must include `issues` and `diagnostics` inside `<plan>` tags. Issue IDs remain strings for runner compatibility. Runnable issues keep deterministic branch names in the form `sandcastle/issue-{id}`.

Issue bodies should use a canonical `## Dependencies` section with `Blocked by`, `Blocks`, and `Depends on decision` markers. The planner treats those markers as high-confidence signals while still considering issue bodies and comments as supporting context.

This favors automation progress over strict no-work behavior when all candidates are blocked, while making the fallback visible to operators and implementers.
