# Sandcastle Init

`sandcastle-init` prepares a Node repository to run the Sandcastle automation workflow from this repo.

The goal is simple: run one setup command in a target repo, answer the prompts, then start Sandcastle with:

```bash
npm run sandcastle
```

## What It Sets Up

The initializer installs a ready-to-run Sandcastle workflow that uses:

- Codex CLI for all model-backed phases.
- GitHub Issues as the work tracker.
- The `Sandcastle` GitHub issue label.
- The Parallel Planner with Review template.
- A repo-specific Docker image, such as `sandcastle-my-repo:latest`.
- A bundled coding standards rubric for Sandcastle reviewer agents.
- Issue-scoped implementer, reviewer, and merger prompts with explicit
  verification and GitHub issue comment requirements.

It also:

- Copies the `.sandcastle/` template files.
- Creates `.sandcastle/.env`.
- Prompts for `GH_TOKEN` when needed.
- Adds `sandcastle` and `test:sandcastle` package scripts.
- Installs `@ai-hero/sandcastle`, `tsx`, and `zod`.
- Creates the GitHub `Sandcastle` label if it does not exist.
- Runs the `.sandcastle` config/schema validator.
- Builds the repo-specific Docker image.
- Checks Docker, GitHub CLI, Codex CLI, and local Codex login files.

## Bundled Agent Workflow

The generated `.sandcastle/` template includes prompt and standards files that
define how Sandcastle agents should work inside the target repo:

- `.sandcastle/CODING_STANDARDS.md` is a reviewer rubric. It covers ambiguity
  handling, minimum-sufficient design, surgical changes, public-interface tests,
  generated template safety, and required verification reporting.
- `.sandcastle/implement-prompt.md` keeps implementers on one assigned issue and
  branch. Implementers must read issue comments and linked specs, define success
  criteria, use TDD for behavior changes when available, commit only related
  changes, and leave a structured issue status comment.
- `.sandcastle/review-prompt.md` reviews a specific issue branch against the
  current target branch. Reviewers receive the issue ID, title, branch, and
  target branch, apply the coding standards rubric, make only high-confidence
  branch-scoped refinements, and report whether the branch is mergeable or should
  be requeued.
- `.sandcastle/merge-prompt.md` uses paired merge candidates that include the
  issue ID, issue title, and branch name. The merger attempts candidates in
  order, respects explicit requeue or hold signals, verifies each successful
  merge, closes only verified issues, and leaves machine-actionable comments for
  skipped or requeued work.

At runtime, `.sandcastle/main.mts` passes the current target branch into reviewer
prompts and passes paired issue/branch merge candidates into the merger prompt,
while keeping the older branch and issue lists available as compatibility
context.

## Prerequisites

Before running the initializer, the target repo needs:

- A `package.json`.
- Docker Desktop running.
- GitHub CLI installed: `gh --version`.
- Codex CLI installed and logged in: `codex --version`.
- Local Codex login files at `~/.codex/auth.json` and `~/.codex/config.toml`.
- A GitHub token with access to manage issues and labels for the repo.

For a fine-grained GitHub token, grant:

- Metadata: read
- Issues: read and write

## Install A Repo From GitHub

Until this package is published to npm, use the GitHub package directly.

From the target repo:

```bash
cd /path/to/your-repo
npm exec --yes --package github:LiamCarlin/sandcastle -- sandcastle-init --yes
```

This is the most reliable command because it explicitly tells npm which GitHub package to install and which binary to run.

The shorter form may also work:

```bash
npx github:LiamCarlin/sandcastle
```

If npm cannot infer the binary, use the explicit `npm exec` command above.

## Future npm Usage

After publishing this package to npm as `sandcastle-init`, usage becomes:

```bash
cd /path/to/your-repo
npx sandcastle-init --yes
```

## What The Command Does

When you run:

```bash
npm exec --yes --package github:LiamCarlin/sandcastle -- sandcastle-init --yes
```

the initializer:

1. Validates that the target repo has `package.json`.
2. Detects npm, pnpm, or yarn from lockfiles.
3. Copies the `.sandcastle/` template.
4. Prompts for `GH_TOKEN` if it is not already in `.sandcastle/.env` or the environment.
5. Writes `.sandcastle/.env`.
6. Adds package scripts:

```json
{
  "sandcastle": "npx tsx --env-file=.sandcastle/.env .sandcastle/main.mts",
  "test:sandcastle": "node --test .sandcastle/*.test.mjs"
}
```

7. Adds required packages if missing.
8. Runs the package manager install command.
9. Runs `test:sandcastle`.
10. Creates the GitHub `Sandcastle` label.
11. Builds a repo-specific Docker image.
12. Writes that image tag to `.sandcastle/.env`.
13. Checks Codex CLI and local Codex login files.

After setup, run:

```bash
npm run sandcastle
```

## Flags

Accept setup defaults and rebuild an existing Docker image:

```bash
sandcastle-init --yes
```

Skip dependency installation:

```bash
sandcastle-init --no-install
```

Skip Docker image checks and build:

```bash
sandcastle-init --no-docker-build
```

You can combine flags:

```bash
sandcastle-init --yes --no-docker-build
```

## Working With Issues

Sandcastle reads open GitHub issues with the `Sandcastle` label.

Create or label issues in the target repo, then run:

```bash
npm run sandcastle
```

The planner selects unblocked issues, assigns deterministic branches like `sandcastle/issue-42`, runs implementer and reviewer phases, and then runs a merge phase for completed branches.

Each implementation branch is reviewed before the merge phase. The merge phase
uses the reviewer comments and paired issue/branch candidates to decide which
branches can be merged and which issues can be closed.

## Troubleshooting

### npm says `sandcastle-init` was not found

The package is not published to npm yet. Use the GitHub command:

```bash
npm exec --yes --package github:LiamCarlin/sandcastle -- sandcastle-init --yes
```

### Docker UID mismatch

If you see an error like:

```text
UID mismatch: image 'sandcastle-my-repo:latest' was built with UID 1000, but the expected UID is 501
```

rebuild the repo image with your host UID and GID:

```bash
docker build -t sandcastle-my-repo:latest \
  --build-arg AGENT_UID=$(id -u) \
  --build-arg AGENT_GID=$(id -g) \
  -f .sandcastle/Dockerfile .
```

Newer versions of `sandcastle-init` do this automatically.

### Docker is not available

Start Docker Desktop, then rerun:

```bash
npm exec --yes --package github:LiamCarlin/sandcastle -- sandcastle-init --yes
```

### Codex login files are missing

Run Codex login, then rerun the initializer:

```bash
codex login
```

### GitHub label creation fails

Check that:

- `gh --version` works.
- The target directory is a GitHub repo.
- `GH_TOKEN` has Issues read/write access.

You can rerun the initializer safely after fixing the token.

## Development

Run checks:

```bash
npm run ci
npm run test:sandcastle
```

Build the published CLI files:

```bash
npm run build
```

Pack locally:

```bash
npm pack
```
