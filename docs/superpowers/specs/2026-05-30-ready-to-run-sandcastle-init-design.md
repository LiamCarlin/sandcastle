# Ready-To-Run Sandcastle Init Design

## Goal

Upgrade `sandcastle-init` from a template copier into a ready-to-run setup command:

```bash
npx sandcastle-init
```

The command should prepare a target repository for Sandcastle automation end to end. It should automate every deterministic step and ask the user only for secrets or decisions that cannot be inferred safely.

## Defaults

The initializer always uses:

- Codex for all model-backed phases.
- GitHub Issues as the work tracker.
- The `Sandcastle` GitHub issue label.
- The Parallel Planner with Review template.
- A repo-specific Docker image by default.

The repo-specific Docker image tag is derived from the target repo name:

```bash
sandcastle-<repo-name>:latest
```

The derived repo name should prefer `package.json` `name`, then the target directory basename. The image-safe form should be lowercase and replace unsupported characters with `-`.

## User Interaction

Default interactive run:

```bash
npx sandcastle-init
```

The CLI asks only when needed:

- Prompt for `GH_TOKEN` if no non-empty token is already available from `.sandcastle/.env` or the current process environment.
- Ask whether to rebuild the repo-specific Docker image if that image already exists.

Token input must stay non-echoing and must never be logged.

Add automation flags:

```bash
npx sandcastle-init --yes
npx sandcastle-init --no-docker-build
npx sandcastle-init --no-install
```

`--yes` accepts safe defaults. If an existing Docker image is found, `--yes` rebuilds it. `--no-docker-build` skips Docker image build and image existence checks. `--no-install` keeps the current behavior of updating files without running the package manager install command.

## Setup Steps

The initializer performs these steps in order:

1. Validate the target repository has a valid `package.json`.
2. Detect the repo name and package manager.
3. Copy the managed `.sandcastle/` template files.
4. Create or update `.sandcastle/.env`.
5. Add or update package scripts:
   - `sandcastle`
   - `test:sandcastle`
6. Add required packages:
   - `@ai-hero/sandcastle`
   - `tsx`
   - `zod`
7. Run the detected package manager install command unless `--no-install` is set.
8. Verify `gh` is installed.
9. Use `GH_TOKEN` for GitHub CLI commands without writing it outside `.sandcastle/.env`.
10. Create the `Sandcastle` GitHub label if it does not exist.
11. Run `npm run test:sandcastle` using the detected package manager's run command.
12. Verify Docker is available unless `--no-docker-build` is set.
13. Build or reuse the repo-specific Docker image.
14. Verify Codex CLI availability and local login files.
15. Print final next step:

```bash
npm run sandcastle
```

## GitHub Label Setup

The initializer creates the issue label with:

- Name: `Sandcastle`
- Description: `Issues ready for Sandcastle automation`
- Color: `0969da`

If the label already exists, the step succeeds. Other GitHub failures stop setup with a clear message.

The implementation should prefer passing the token through the `GH_TOKEN` environment variable to child processes rather than shelling out with the token in command arguments.

## Docker Behavior

The initializer builds from:

```bash
.sandcastle/Dockerfile
```

Default image tag:

```bash
sandcastle-<repo-name>:latest
```

If the image does not exist, build it automatically.

If the image exists:

- Interactive mode asks whether to rebuild.
- `--yes` rebuilds.
- A negative answer reuses the existing image.

The Docker build should run from the target repository root:

```bash
docker build -t sandcastle-<repo-name>:latest -f .sandcastle/Dockerfile .
```

If Docker Desktop is not running or `docker` is unavailable, setup fails clearly unless `--no-docker-build` is set.

## Validation

After dependency installation, the initializer runs:

```bash
npm run test:sandcastle
```

For pnpm or yarn repos, use the matching run command:

- `pnpm run test:sandcastle`
- `yarn run test:sandcastle`

This validates the copied automation config and schema dependencies.

## Codex Preflight

The initializer verifies:

- `codex --version` works.
- `~/.codex/auth.json` exists.
- `~/.codex/config.toml` exists.

If any check fails, setup stops with a clear message explaining what the user needs to fix before running Sandcastle.

## Error Handling

The initializer should fail fast with clear step names.

Examples:

- `GitHub CLI is not installed. Install gh and rerun sandcastle-init.`
- `GH_TOKEN could not create or read labels for this repo. Check token permissions.`
- `Docker is not available. Start Docker Desktop or rerun with --no-docker-build.`
- `Codex CLI login files were not found. Run codex login and rerun sandcastle-init.`

Partial setup is acceptable because the command remains idempotent. Rerunning should continue safely.

## Testing

Tests should cover:

- Repo name normalization for Docker image tags.
- Reusing existing `GH_TOKEN` without prompting.
- Prompting for missing `GH_TOKEN`.
- Creating the GitHub label and treating existing label as success.
- Running `test:sandcastle` after install.
- Building a new Docker image.
- Asking about an existing Docker image.
- `--yes` rebuilding an existing Docker image without asking.
- `--no-docker-build` skipping Docker checks/builds.
- Codex preflight success and failure cases.
- Token not appearing in command arguments or CLI output.

End-to-end verification should run against a temporary target repo with injected command runners so tests do not require real GitHub, Docker, or Codex access.
