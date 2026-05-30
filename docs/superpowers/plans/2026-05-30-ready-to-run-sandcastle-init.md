# Ready-To-Run Sandcastle Init Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `npx sandcastle-init` fully prepare a target repo for Sandcastle automation, including GitHub label setup, validation, Docker image build, and Codex preflight.

**Architecture:** Extend `src/init.ts` as the orchestration layer with injected command execution, prompting, environment, and home directory dependencies so tests can verify GitHub, Docker, and Codex behavior without real services. Keep `src/cli.ts` responsible for user prompting and flags only. Preserve the existing template-copying and package setup behavior.

**Tech Stack:** TypeScript, Commander, Vitest, Node `fs/promises`, Node `child_process`, Docker CLI, GitHub CLI, Codex CLI.

---

## File Structure

- Modify `src/init.ts`: add setup orchestration for GitHub labels, validation, Docker image build/reuse, Codex preflight, repo-name normalization, and package-manager run commands.
- Modify `src/cli.ts`: add `--yes` and `--no-docker-build`, pass confirmation prompts into the initializer, and avoid prompting for `GH_TOKEN` when one already exists.
- Modify `test/init.test.ts`: add tests for the ready-to-run orchestration using injected command runners.
- Modify `test/cli.test.ts`: cover new flags and prompt behavior.
- Rebuild `dist/cli.js` and `dist/init.js`.
- Commit the plan and each implementation milestone.

---

### Task 1: Add Ready-To-Run Initializer Tests

**Files:**
- Modify: `test/init.test.ts`

- [ ] Add tests that exercise command orchestration with injected `runCommand`.
- [ ] Cover reuse of existing `GH_TOKEN` from `.sandcastle/.env`.
- [ ] Cover repo-name normalization for Docker tag generation.
- [ ] Cover GitHub label creation via `gh label create Sandcastle --color 0969da --description "Issues ready for Sandcastle automation"` with `GH_TOKEN` passed through child process env, not args.
- [ ] Cover “label already exists” as success.
- [ ] Cover package-manager install and `run test:sandcastle`.
- [ ] Cover Docker image absent -> `docker build -t sandcastle-<repo>:latest -f .sandcastle/Dockerfile .`.
- [ ] Cover Docker image exists -> asks whether to rebuild.
- [ ] Cover `yes: true` rebuilding an existing Docker image without asking.
- [ ] Cover `dockerBuild: false` skipping Docker commands.
- [ ] Cover Codex preflight: `codex --version`, `~/.codex/auth.json`, `~/.codex/config.toml`.
- [ ] Cover token does not appear in command args or output.
- [ ] Run `npm run test -- test/init.test.ts` and confirm failing tests before implementation.

---

### Task 2: Implement Ready-To-Run Orchestration

**Files:**
- Modify: `src/init.ts`

- [ ] Extend `InitSandcastleOptions` with:
  - `yes?: boolean`
  - `dockerBuild?: boolean`
  - `confirm?: (question: string) => Promise<boolean>`
  - `env?: NodeJS.ProcessEnv`
  - `homeDir?: string`
- [ ] Change `RunCommand` to receive optional `env` and capture/structured failure support where needed.
- [ ] Return a setup summary containing `imageTag`, `ghTokenSource`, and completed steps.
- [ ] Add `normalizeDockerName(name: string): string` export for tests.
- [ ] Read existing token from `.sandcastle/.env` after copying templates, or from `env.GH_TOKEN`, before using prompted token.
- [ ] Run package install unless `install === false`.
- [ ] Run package-manager validation command:
  - npm: `npm run test:sandcastle`
  - pnpm: `pnpm run test:sandcastle`
  - yarn: `yarn run test:sandcastle`
- [ ] Verify `gh --version`.
- [ ] Create the `Sandcastle` label with `GH_TOKEN` in child env.
- [ ] Treat a command failure containing “already exists” as label success.
- [ ] Verify Docker with `docker version` unless `dockerBuild === false`.
- [ ] Check image existence with `docker image inspect <tag>`.
- [ ] If absent, build image.
- [ ] If present and `yes === true`, rebuild image.
- [ ] If present and `yes !== true`, call `confirm`; rebuild only on true.
- [ ] Verify Codex with `codex --version`.
- [ ] Check Codex login files in `homeDir/.codex`.
- [ ] Emit clear progress lines without secrets.
- [ ] Run `npm run test -- test/init.test.ts` and `npm run typecheck`.

---

### Task 3: Add CLI Flags And Prompt Routing

**Files:**
- Modify: `src/cli.ts`
- Modify: `test/cli.test.ts`

- [ ] Add Commander options:
  - `--yes`
  - `--no-docker-build`
  - keep `--no-install`
- [ ] Add a yes/no prompt helper for Docker rebuild confirmation.
- [ ] Keep `GH_TOKEN` prompt non-echoing.
- [ ] Avoid prompting for `GH_TOKEN` in CLI tests when env or existing `.env` provides it.
- [ ] Pass `yes`, `dockerBuild`, `confirm`, and existing `install` into `initSandcastle`.
- [ ] Update final output to include Docker image tag and `npm run sandcastle`.
- [ ] Add CLI tests for `--yes`, `--no-docker-build`, and non-token output.
- [ ] Run `npm run test -- test/cli.test.ts` and `npm run typecheck`.

---

### Task 4: Build Artifacts And End-To-End Verification

**Files:**
- Modify: `dist/cli.js`
- Modify: `dist/init.js`

- [ ] Run `npm run build`.
- [ ] Run `npm run ci`.
- [ ] Run `npm run test:sandcastle`.
- [ ] Pack the CLI with `npm pack --json`.
- [ ] Run the packed CLI against a temporary target repo with `--no-install --no-docker-build` and injected `GH_TOKEN` to verify file setup without real Docker/GitHub changes.
- [ ] Run at least one injected-command test path that includes Docker/GitHub/Codex orchestration.
- [ ] Remove generated tarballs/temp dirs.
- [ ] Commit build and verification fixes.

---

## Self-Review

Spec coverage:

- Automatic GitHub label creation: Tasks 1 and 2.
- Schema/config validator: Tasks 1 and 2 via `test:sandcastle`.
- Repo-specific Docker image: Tasks 1 and 2.
- Existing-image prompt and `--yes`: Tasks 1, 2, and 3.
- `--no-docker-build` and `--no-install`: Tasks 1, 2, and 3.
- Codex-only preflight and login files: Tasks 1 and 2.
- GitHub Issues and Parallel Planner template remain covered by the existing copied template and final verification.

Placeholder scan: no TODO/TBD placeholders remain.

Type consistency: option names are `yes`, `dockerBuild`, `confirm`, `env`, and `homeDir` across initializer and CLI tasks.
