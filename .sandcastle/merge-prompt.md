# TASK

Merge completed Sandcastle branches into the current target branch.

Use `MERGE_CANDIDATES` as the canonical mapping of issues to branches:

{{MERGE_CANDIDATES}}

Compatibility branch list:

{{BRANCHES}}

Compatibility issue list:

{{ISSUES}}

# PRECEDENCE

1. The current target branch and `MERGE_CANDIDATES` define what may be merged.
2. This merger prompt defines the merge workflow and boundaries.
3. Reviewer issue comments define merge readiness, requeue, or hold signals.
4. Implementer comments, issue body, dependency markers, docs, ADRs, tests, and
   code provide context for conflicts and verification failures.
5. `.sandcastle/CODING_STANDARDS.md` applies only to conflict resolutions,
   integration fixes, or tests written by the merger.

If these conflict, follow the higher-priority item.

# MERGE POLICY

Default to attempting every provided branch. Do not require human intervention.
Missing review comments or imperfect metadata are not blocking by themselves.

Skip a branch only before attempting the merge, and only when there is an
explicit reason:

- The latest review comment says `Review: Requeue recommended`.
- The latest review comment or issue comments explicitly say the branch should
  be held.
- The branch no longer exists or cannot be fetched.
- The issue/branch mapping is unusable, so you cannot know which issue would be
  closed.
- The target worktree is dirty before the merge starts with unrelated
  pre-existing changes.

Once a branch is attempted, a conflict or test failure is not a skip. Resolve
integration-only problems when the cause is clear. If the branch cannot be
integrated safely, use `Merge: Requeue recommended`.

Preserve the provided candidate order. Do not reorder by perceived importance.

# REQUIRED INPUTS

Before starting:

1. Run `git status --short`. The target worktree must be clean except for files
   you intentionally create during this merge phase.
2. Read each issue with comments using `gh issue view <ID> --comments`.
3. Identify the latest reviewer status comment for each issue:
   - `Review: Passed`
   - `Review: Refined`
   - `Review: Needs follow-up`
   - `Review: Requeue recommended`
4. Read implementer/reviewer comments, dependency markers, and issue context only
   as needed to decide merge readiness, resolve conflicts, or understand
   verification failures.

# PER-BRANCH LOOP

For each merge candidate in order:

1. Check `git status --short`.
2. If the branch has an explicit pre-merge skip reason, leave a `Merge: Skipped`
   issue comment with the reason and continue to the next candidate.
3. Run `git merge <branch> --no-edit`.
4. If there are merge conflicts, read both sides and resolve the integration
   conflict correctly. Do not redesign feature behavior or implement missing
   issue scope.
5. If conflict resolution or integration-only fixes require tests, update or add
   tests only when the combined behavior is clear.
6. Run verification after the branch is merged:
   - `npm run typecheck`
   - `npm run test`
7. If verification fails, fix clear integration-only failures and rerun the
   failing command plus any affected standard checks.
8. If the branch is merged and verification passes, close the issue with a
   `Merge: Completed` close comment including the branch and verification
   results.
9. If the branch cannot be integrated safely, restore the target branch to a
   clean state using `git merge --abort` when applicable. Then leave
   `Merge: Requeue recommended` with exact failure details and continue only if
   the worktree is clean.

Close an issue only after its branch has merged into the current target branch
and verification has passed.

# INTEGRATION FIXES

The merger may make code or test changes only for integration-level problems
caused by combining completed branches:

- merge conflict resolutions
- import/export mismatches introduced by merged branches
- tests that need clear integration-level updates
- small compatibility fixes required for the merged target branch to pass

Do not implement missing feature scope, invent product behavior, perform broad
refactors, or do review-style cleanup. If a failure shows the issue was not fully
implemented, requeue it instead.

If repository files changed during conflict resolution or integration fixes,
commit those changes as part of the merge flow. Do not create an extra summary
commit when merges and conflict-resolution commits already record the work.

# REQUEUE

Use `Merge: Requeue recommended` when an attempted branch cannot be integrated
safely by the merger. Make the next automation pass self-resolving:

- name the exact branch and issue
- include the conflict, failing command, failing files/tests, or error output
- explain why it was not safe as an integration-only fix
- recommend the next automated action
- say whether the target branch was restored cleanly

Update the issue body's `## Dependencies` section only when a canonical marker
would help the planner, such as `Blocked by: #123` or
`Depends on decision: ...`. Do not rewrite acceptance criteria, scope, titles,
labels, assignments, or domain requirements.

# ISSUE COMMENTS

Use these statuses:

- `Merge: Completed` for successfully merged, verified, and closed issues.
- `Merge: Skipped` only for branches not attempted due to an explicit pre-merge
  skip reason.
- `Merge: Requeue recommended` for attempted branches that could not be safely
  integrated.

For successful issues, use `gh issue close <ID> --comment "<message>"` and make
the close comment the merge comment. Include:

- status
- merged branch
- verification commands and results
- integration fixes or conflict resolutions, if any
- review metadata gaps, if relevant

For skipped or requeued issues, leave a normal issue comment and do not close the
issue.

# FINAL CHECK

Run a final `npm run typecheck` and `npm run test` once after all successful
merges only if conflict resolutions or integration fixes were made.

Before finishing, run `git status --short` and ensure the target worktree is
clean. Do not delete merged branches.

# FINAL OUTPUT

Output only:

<promise>COMPLETE</promise>
