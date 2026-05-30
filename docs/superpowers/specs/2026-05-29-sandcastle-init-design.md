# Sandcastle Init CLI Design

## Goal

Turn this repository into the source package for an npm initializer command:

```bash
npx sandcastle-init
```

The command prepares another repository to run the Sandcastle automation that already works in this base repo. The target user should only need to run one command, paste a GitHub token when prompted, and then start the automation with `npm run sandcastle`.

## Scope

The first version targets Node-based repositories with an existing `package.json`. It does not need to initialize non-Node repositories yet.

The initializer will:

- Run in the current working directory by default.
- Copy the reusable `.sandcastle/` template files from this package into the target repository.
- Exclude runtime and secret files, including `.sandcastle/.env` and `.sandcastle/logs/`.
- Create `.sandcastle/.env` from `.sandcastle/.env.example`.
- Prompt interactively for `GH_TOKEN`, accept pasted input, and write the value into `.sandcastle/.env`.
- Avoid printing the token back to stdout.
- Add package scripts for `sandcastle` and `test:sandcastle`.
- Add required package dependencies if missing.
- Be safe to rerun without duplicating scripts, dependencies, or environment entries.

## Command Behavior

`sandcastle-init` treats `process.cwd()` as the target repository. It validates that `package.json` exists and is valid JSON before writing files.

The command copies these managed template files:

- `.sandcastle/.env.example`
- `.sandcastle/.gitignore`
- `.sandcastle/CODING_STANDARDS.md`
- `.sandcastle/Dockerfile`
- `.sandcastle/automation-config.mjs`
- `.sandcastle/automation-config.test.mjs`
- `.sandcastle/main.mts`
- `.sandcastle/implement-prompt.md`
- `.sandcastle/merge-prompt.md`
- `.sandcastle/plan-prompt.md`
- `.sandcastle/review-prompt.md`

The command never copies `.sandcastle/.env` from the base repo. If the target already has `.sandcastle/.env`, the initializer preserves existing values and updates only the `GH_TOKEN` line when the user provides a token.

If the user submits an empty token, the initializer leaves `GH_TOKEN=` empty and prints a next step telling the user to edit `.sandcastle/.env` before running the automation.

## Package Updates

The initializer updates `package.json` in the target repo:

```json
{
  "scripts": {
    "sandcastle": "npx tsx --env-file=.sandcastle/.env .sandcastle/main.mts",
    "test:sandcastle": "node --test .sandcastle/*.test.mjs"
  }
}
```

It also adds these packages to `devDependencies` when they are missing:

- `@ai-hero/sandcastle`
- `tsx`
- `zod`

The initializer detects the target package manager from lockfiles. It uses `npm install` when `package-lock.json` exists or when no package manager lockfile is present. It uses the matching install command for `pnpm-lock.yaml` or `yarn.lock`.

## User Flow

1. User opens a target repo.
2. User runs `npx sandcastle-init`.
3. CLI validates the repo and copies the `.sandcastle/` template.
4. CLI prompts: `Paste GH_TOKEN for GitHub Issues access:`.
5. User pastes the token and presses enter.
6. CLI writes `.sandcastle/.env`.
7. CLI updates `package.json` and installs dependencies.
8. CLI prints:
   - `codex --version` should work.
   - Codex CLI should already be logged in.
   - Run `npm run test:sandcastle`.
   - Run `npm run sandcastle`.

## Error Handling

The initializer fails before writing when no `package.json` exists.

For partial failures after writing files, the command reports the failed step and leaves already-written files in place. Because the operation is idempotent, the user can rerun the command after fixing the problem.

The command must not log secrets. Token input is treated as sensitive output even though terminal paste itself may be visible depending on the terminal.

## Testing

Tests should cover:

- Refusing to run without `package.json`.
- Copying the managed `.sandcastle/` files while excluding `.env` and logs.
- Creating `.sandcastle/.env` from `.env.example`.
- Updating `GH_TOKEN` when a token is entered.
- Preserving an existing `.sandcastle/.env` when token input is empty.
- Adding package scripts idempotently.
- Adding required dependencies idempotently.

## Package Name

The package should publish as `sandcastle-init` with a binary named `sandcastle-init`, because that directly supports the desired `npx sandcastle-init` user experience.
