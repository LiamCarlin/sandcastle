# ISSUES

Here are the open issues in the repo:

<issues-json>

!`gh issue list --state open --label Sandcastle --limit 100 --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`

</issues-json>

The list above has already been filtered to issues ready for work.

# TASK

Analyze the input issues and build a dependency graph. The planner is a strict selector: it identifies dependency relationships and returns runnable candidates. It does not design solutions, rewrite requirements, edit issues, edit repository files, or choose implementation strategy.

The planner is read-only. Do not edit issues, labels, comments, branches, or repository files.

Always produce valid `<plan>` JSON. Plan mode should not fail because the issue list is empty, ambiguous, legacy-formatted, or partially malformed. Infrastructure failures such as GitHub command failures, Codex CLI failures, sandbox failures, or schema parser failures remain outside this prompt.

Only reason about issues present in `<issues-json>`. Do not mention missing repository issues or unlabeled issues.

An issue B is **blocked by** issue A if:

- B requires code or infrastructure that A introduces
- B and A modify overlapping files or modules, making concurrent work likely to produce merge conflicts
- B's requirements depend on a decision or API shape that A will establish

An issue is **unblocked** if it has zero blocking dependencies on other input issues and no unresolved decision blocker.

# DEPENDENCY MARKERS

Treat the issue body `## Dependencies` section as the canonical source for explicit dependency markers. Use comments as supporting context. Comments may raise inferred blockers or stale-metadata diagnostics when they contain clear newer dependency language, but they do not normally override body markers.

Canonical markers:

- `Blocked by: #123` means this issue must not run before #123.
- `Blocks: #456` means this issue should complete before #456.
- `Depends on decision: ...` means this issue needs a human, architectural, API, or domain decision before it is safe to implement.
- `Blocked by: None - can start immediately` means no known blocker exists.
- `Blocks: None` means this issue has no known downstream dependents.
- `Depends on decision: None` means no known decision blocker exists.

`Blocked by` is authoritative for the issue being evaluated. Use `Blocks` to cross-check other issues. If marker directions conflict, report the conflict through diagnostics and prefer the `Blocked by` marker on the issue being evaluated unless the surrounding issue body or comments clearly identify a blocker.

Explicit markers are high-confidence signals, not the only dependency evidence. Still infer blockers from requirements, likely merge conflicts, unresolved decisions, issue body text, and comments. If an issue says it can start immediately but clearly depends on another input issue, treat it as blocked.

If an issue has no `## Dependencies` section, treat it as legacy input. Infer dependencies from the full issue body and comments; do not fail the plan.

# BLOCKER TYPES

Use these `blockerType` values in diagnostics for `blocked` and `fallback` issue diagnostics:

- `decision`: unresolved human, architectural, API, or domain decision.
- `explicit-blocked-by`: direct `Blocked by` marker.
- `required-code`: code, infrastructure, schema, API shape, or configuration from another issue is required first.
- `merge-conflict`: likely overlapping files or modules would make concurrent work risky.
- `inferred-sequencing`: weak sequencing concern inferred from body, comments, or conflicting markers.

Do not add a separate confidence field. The blocker type carries the useful distinction.

# LEAST-BLOCKED FALLBACK

If one or more issues are unblocked, return every unblocked issue.

If every issue is blocked, return exactly one least-blocked fallback issue so automation can continue. Mark it with `"fallback": true` in `issues` and `status: "fallback"` in diagnostics.

Choose the least-blocked fallback by sorting candidates in this order:

1. Fewest blocking issues.
2. Weakest blocker type.
3. Lowest numeric GitHub issue number.

Blocker strength, strongest to weakest:

1. `decision`
2. `explicit-blocked-by`
3. `required-code`
4. `merge-conflict`
5. `inferred-sequencing`

For each unblocked issue, assign a branch name using the exact format `sandcastle/issue-{id}` (no slug or other suffix). This must be deterministic so that re-planning the same issue always produces the same branch name and accumulated progress is preserved.

Fallback issues use the same branch format.

Return issue IDs as strings everywhere.

Sort `issues` by ascending numeric GitHub issue id. Do not reorder by perceived importance. Do not limit results based on `MAX_PARALLEL_ISSUES`; the runner applies the parallelism limit after parsing the plan.

# OUTPUT

Output only the `<plan>...</plan>` block. Do not include prose, Markdown fences, explanation, or text outside the tags.

Always emit:

- `issues`: runnable candidates, or the single least-blocked fallback if all candidates are blocked.
- `diagnostics`: one diagnostic object for every input issue.

If there are no issues to work on at all, output:

<plan>{"issues":[],"diagnostics":[]}</plan>

If the issue list cannot be interpreted, output no runnable issues and a synthetic diagnostic using `id: "planner-input"`:

<plan>{"issues":[],"diagnostics":[{"id":"planner-input","title":"Planner input","status":"blocked","reason":"The issue list could not be interpreted; no runnable issues selected."}]}</plan>

Diagnostic statuses:

- `unblocked`: safe runnable candidate.
- `blocked`: not selected because blocked.
- `fallback`: selected even though blocked because all candidates were blocked.

Every diagnostic must include `id`, `title`, `status`, and a concise `reason`.

For `blocked` and `fallback` diagnostics about real issues, include `blockedBy` and `blockerType` when another input issue or decision blocks the work. Omit `blockedBy` and `blockerType` for `planner-input`.

Keep `issues` entries execution-oriented:

- normal issue: `id`, `title`, `branch`
- fallback issue: `id`, `title`, `branch`, `fallback: true`

Put reasoning only in `diagnostics`.

Example:

<plan>
{
  "issues": [
    {"id": "42", "title": "Add config validation", "branch": "sandcastle/issue-42"}
  ],
  "diagnostics": [
    {"id": "42", "title": "Add config validation", "status": "unblocked", "reason": "No blocking dependencies found."},
    {"id": "43", "title": "Add CLI command", "status": "blocked", "blockedBy": ["42"], "blockerType": "required-code", "reason": "Depends on config validation from #42."}
  ]
}
</plan>
