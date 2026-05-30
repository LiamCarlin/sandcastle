# Sandcastle Init Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and package `npx sandcastle-init` so a target Node repository can be prepared for Sandcastle automation with one command and an interactive `GH_TOKEN` prompt.

**Architecture:** Keep the installer behavior in a testable `src/init.ts` module with injected filesystem root, token value, output writer, and command runner. Make `src/cli.ts` a thin Commander wrapper that prompts for `GH_TOKEN`, calls the initializer, and reports next steps. Package `.sandcastle/` template files as npm publishable assets and expose a `sandcastle-init` binary.

**Tech Stack:** TypeScript, Commander, Vitest, Node `fs/promises`, Node `child_process`, npm package `bin` metadata.

---

## File Structure

- Modify `src/cli.ts`: replace the greeting command with the `sandcastle-init` CLI entrypoint and token prompt.
- Create `src/init.ts`: implement idempotent template copying, `.env` creation/update, `package.json` patching, dependency detection, package manager detection, and install command execution.
- Delete or ignore `src/app.ts`: the greeting helper is no longer part of the product surface.
- Replace `test/cli.test.ts`: test the new CLI wrapper without invoking real installs.
- Create `test/init.test.ts`: test initializer behavior against temporary target repositories.
- Modify `package.json`: rename package to `sandcastle-init`, add `bin`, publish `.sandcastle/`, and keep repo scripts.
- Modify `tsconfig.json` only if the package metadata or test setup requires additional included files.

---

### Task 1: Core Initializer Tests

**Files:**
- Create: `test/init.test.ts`
- Modify: none
- Test: `test/init.test.ts`

- [ ] **Step 1: Write failing tests for repository validation, copying, env handling, package updates, and install command selection**

Create `test/init.test.ts`:

```ts
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import { initSandcastle } from "../src/init.js";

async function makeTarget(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "sandcastle-init-"));
  await writeFile(join(dir, "package.json"), JSON.stringify({ name: "target", version: "1.0.0" }, null, 2));
  return dir;
}

describe("initSandcastle", () => {
  it("refuses to run without package.json", async () => {
    const targetDir = await mkdtemp(join(tmpdir(), "sandcastle-init-empty-"));

    await expect(initSandcastle({ targetDir, ghToken: "ghp_test", install: false })).rejects.toThrow(
      "package.json is required",
    );
  });

  it("copies managed template files and excludes runtime files", async () => {
    const targetDir = await makeTarget();

    await initSandcastle({ targetDir, ghToken: "ghp_test", install: false });

    await expect(readFile(join(targetDir, ".sandcastle/main.mts"), "utf8")).resolves.toContain(
      "Parallel Planner with Review",
    );
    await expect(readFile(join(targetDir, ".sandcastle/logs/main-preflight.log"), "utf8")).rejects.toThrow();
  });

  it("creates .env from the example and writes the provided GH_TOKEN", async () => {
    const targetDir = await makeTarget();

    await initSandcastle({ targetDir, ghToken: "ghp_secret_value", install: false });

    const env = await readFile(join(targetDir, ".sandcastle/.env"), "utf8");
    expect(env).toContain("CODEX_MODEL=gpt-5.5");
    expect(env).toContain("GH_TOKEN=ghp_secret_value");
  });

  it("preserves an existing .env when token input is empty", async () => {
    const targetDir = await makeTarget();
    await initSandcastle({ targetDir, ghToken: "ghp_original", install: false });

    await initSandcastle({ targetDir, ghToken: "", install: false });

    const env = await readFile(join(targetDir, ".sandcastle/.env"), "utf8");
    expect(env).toContain("GH_TOKEN=ghp_original");
  });

  it("updates an existing GH_TOKEN when a new token is entered", async () => {
    const targetDir = await makeTarget();
    await initSandcastle({ targetDir, ghToken: "ghp_original", install: false });

    await initSandcastle({ targetDir, ghToken: "ghp_replacement", install: false });

    const env = await readFile(join(targetDir, ".sandcastle/.env"), "utf8");
    expect(env).toContain("GH_TOKEN=ghp_replacement");
    expect(env).not.toContain("ghp_original");
  });

  it("adds scripts and devDependencies idempotently", async () => {
    const targetDir = await makeTarget();

    await initSandcastle({ targetDir, ghToken: "ghp_test", install: false });
    await initSandcastle({ targetDir, ghToken: "ghp_test", install: false });

    const packageJson = JSON.parse(await readFile(join(targetDir, "package.json"), "utf8"));
    expect(packageJson.scripts.sandcastle).toBe("npx tsx --env-file=.sandcastle/.env .sandcastle/main.mts");
    expect(packageJson.scripts["test:sandcastle"]).toBe("node --test .sandcastle/*.test.mjs");
    expect(packageJson.devDependencies["@ai-hero/sandcastle"]).toBeDefined();
    expect(packageJson.devDependencies.tsx).toBeDefined();
    expect(packageJson.devDependencies.zod).toBeDefined();
  });

  it("runs the detected package manager install command", async () => {
    const targetDir = await makeTarget();
    const commands: Array<{ command: string; args: string[]; cwd: string }> = [];

    await initSandcastle({
      targetDir,
      ghToken: "ghp_test",
      install: true,
      runCommand: async (command, args, options) => {
        commands.push({ command, args, cwd: options.cwd });
      },
    });

    expect(commands).toEqual([{ command: "npm", args: ["install"], cwd: targetDir }]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail because `src/init.ts` does not exist**

Run: `npm run test -- test/init.test.ts`

Expected: FAIL with an import error for `../src/init.js`.

- [ ] **Step 3: Commit the failing tests**

```bash
git add test/init.test.ts
git commit -m "test: cover sandcastle initializer behavior"
```

---

### Task 2: Core Initializer Implementation

**Files:**
- Create: `src/init.ts`
- Test: `test/init.test.ts`

- [ ] **Step 1: Implement the initializer module**

Create `src/init.ts`:

```ts
import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type RunCommand = (command: string, args: string[], options: { cwd: string }) => Promise<void>;

export type InitSandcastleOptions = {
  targetDir: string;
  ghToken?: string;
  install?: boolean;
  writeLine?: (line: string) => void;
  runCommand?: RunCommand;
};

const managedTemplateFiles = [
  ".sandcastle/.env.example",
  ".sandcastle/.gitignore",
  ".sandcastle/CODING_STANDARDS.md",
  ".sandcastle/Dockerfile",
  ".sandcastle/automation-config.mjs",
  ".sandcastle/automation-config.test.mjs",
  ".sandcastle/main.mts",
  ".sandcastle/implement-prompt.md",
  ".sandcastle/merge-prompt.md",
  ".sandcastle/plan-prompt.md",
  ".sandcastle/review-prompt.md",
];

const requiredDevDependencies: Record<string, string> = {
  "@ai-hero/sandcastle": "^0.6.6",
  tsx: "^4.20.6",
  zod: "^4.4.3",
};

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function defaultRunCommand(command: string, args: string[], options: { cwd: string }): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

async function readPackageJson(targetDir: string): Promise<Record<string, unknown>> {
  const packageJsonPath = join(targetDir, "package.json");
  if (!(await pathExists(packageJsonPath))) {
    throw new Error("package.json is required to initialize Sandcastle");
  }

  return JSON.parse(await readFile(packageJsonPath, "utf8")) as Record<string, unknown>;
}

async function copyTemplates(targetDir: string): Promise<void> {
  for (const relativePath of managedTemplateFiles) {
    const source = join(packageRoot, relativePath);
    const destination = join(targetDir, relativePath);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(source, destination);
  }
}

function upsertEnvValue(contents: string, key: string, value: string): string {
  const lines = contents.split(/\r?\n/);
  const index = lines.findIndex((line) => line.startsWith(`${key}=`));
  if (index >= 0) {
    lines[index] = `${key}=${value}`;
  } else {
    lines.push(`${key}=${value}`);
  }
  return `${lines.filter((line, i) => i < lines.length - 1 || line.length > 0).join("\n")}\n`;
}

async function writeEnv(targetDir: string, ghToken: string): Promise<void> {
  const envPath = join(targetDir, ".sandcastle/.env");
  const examplePath = join(targetDir, ".sandcastle/.env.example");
  const existing = (await pathExists(envPath))
    ? await readFile(envPath, "utf8")
    : await readFile(examplePath, "utf8");

  const next = ghToken.trim() ? upsertEnvValue(existing, "GH_TOKEN", ghToken.trim()) : existing;
  await writeFile(envPath, next);
}

async function writePackageJson(targetDir: string, packageJson: Record<string, unknown>): Promise<void> {
  const scripts = { ...((packageJson.scripts as Record<string, string> | undefined) ?? {}) };
  scripts.sandcastle = "npx tsx --env-file=.sandcastle/.env .sandcastle/main.mts";
  scripts["test:sandcastle"] = "node --test .sandcastle/*.test.mjs";

  const devDependencies = {
    ...requiredDevDependencies,
    ...((packageJson.devDependencies as Record<string, string> | undefined) ?? {}),
  };

  packageJson.scripts = scripts;
  packageJson.devDependencies = devDependencies;
  await writeFile(join(targetDir, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);
}

async function detectInstallCommand(targetDir: string): Promise<{ command: string; args: string[] }> {
  if (await pathExists(join(targetDir, "pnpm-lock.yaml"))) return { command: "pnpm", args: ["install"] };
  if (await pathExists(join(targetDir, "yarn.lock"))) return { command: "yarn", args: ["install"] };
  return { command: "npm", args: ["install"] };
}

export async function initSandcastle(options: InitSandcastleOptions): Promise<void> {
  const writeLine = options.writeLine ?? (() => undefined);
  const packageJson = await readPackageJson(options.targetDir);

  await copyTemplates(options.targetDir);
  await writeEnv(options.targetDir, options.ghToken ?? "");
  await writePackageJson(options.targetDir, packageJson);

  if (options.install !== false) {
    const installCommand = await detectInstallCommand(options.targetDir);
    writeLine(`Installing dependencies with ${installCommand.command} ${installCommand.args.join(" ")}...`);
    await (options.runCommand ?? defaultRunCommand)(installCommand.command, installCommand.args, {
      cwd: options.targetDir,
    });
  }
}
```

- [ ] **Step 2: Run the core initializer tests**

Run: `npm run test -- test/init.test.ts`

Expected: PASS.

- [ ] **Step 3: Commit the implementation**

```bash
git add src/init.ts test/init.test.ts
git commit -m "feat: add sandcastle initializer core"
```

---

### Task 3: CLI Wrapper and Interactive Token Prompt

**Files:**
- Modify: `src/cli.ts`
- Modify: `test/cli.test.ts`
- Test: `test/cli.test.ts`

- [ ] **Step 1: Replace CLI tests with installer CLI behavior**

Replace `test/cli.test.ts`:

```ts
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createCli } from "../src/cli.js";

describe("cli", () => {
  it("initializes the current directory using provided token input", async () => {
    const targetDir = await mkdtemp(join(tmpdir(), "sandcastle-cli-"));
    await writeFile(join(targetDir, "package.json"), JSON.stringify({ name: "target" }, null, 2));
    const output: string[] = [];
    const cli = createCli({
      cwd: targetDir,
      input: async () => "ghp_cli_secret",
      writeLine: (line) => output.push(line),
      install: false,
    });

    await cli.parseAsync(["node", "sandcastle-init"]);

    const env = await readFile(join(targetDir, ".sandcastle/.env"), "utf8");
    expect(env).toContain("GH_TOKEN=ghp_cli_secret");
    expect(output.join("\n")).toContain("Sandcastle initialized");
    expect(output.join("\n")).not.toContain("ghp_cli_secret");
  });
});
```

- [ ] **Step 2: Run the CLI test to verify it fails against the old greeting CLI**

Run: `npm run test -- test/cli.test.ts`

Expected: FAIL because `createCli` does not accept the new options and does not initialize `.sandcastle`.

- [ ] **Step 3: Implement the CLI wrapper**

Replace `src/cli.ts`:

```ts
#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Command } from "commander";

import { initSandcastle } from "./init.js";

type CliOptions = {
  cwd?: string;
  input?: (prompt: string) => Promise<string>;
  writeLine?: (line: string) => void;
  install?: boolean;
};

async function promptForToken(prompt: string): Promise<string> {
  const readline = createInterface({ input, output });
  try {
    return await readline.question(prompt);
  } finally {
    readline.close();
  }
}

export function createCli(options: CliOptions = {}): Command {
  const writeLine = options.writeLine ?? console.log;
  const readInput = options.input ?? promptForToken;
  const program = new Command();

  program
    .name("sandcastle-init")
    .description("Prepare this repository for Sandcastle automation")
    .option("--no-install", "update files without running the package manager install command")
    .action(async (commandOptions: { install: boolean }) => {
      const ghToken = await readInput("Paste GH_TOKEN for GitHub Issues access: ");
      await initSandcastle({
        targetDir: options.cwd ?? process.cwd(),
        ghToken,
        install: options.install ?? commandOptions.install,
        writeLine,
      });

      writeLine("Sandcastle initialized.");
      writeLine("Next steps:");
      writeLine("1. Confirm Codex CLI is installed and logged in: codex --version");
      writeLine("2. Run npm run test:sandcastle");
      writeLine("3. Run npm run sandcastle");
    });

  return program;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await createCli().parseAsync(process.argv);
}
```

- [ ] **Step 4: Run the CLI tests**

Run: `npm run test -- test/cli.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the CLI wrapper**

```bash
git add src/cli.ts test/cli.test.ts
git commit -m "feat: add sandcastle init cli"
```

---

### Task 4: Package Metadata

**Files:**
- Modify: `package.json`
- Test: `package.json`

- [ ] **Step 1: Update package metadata for `npx sandcastle-init`**

Modify `package.json` to include these top-level fields while preserving existing scripts that still apply:

```json
{
  "name": "sandcastle-init",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "sandcastle-init": "./src/cli.ts"
  },
  "files": [
    "src",
    ".sandcastle",
    "README.md"
  ]
}
```

Keep the existing `scripts`, `dependencies`, and `devDependencies`. Remove no runtime dependency unless tests show it is unused.

- [ ] **Step 2: Verify npm can see the binary and template files**

Run: `npm pack --dry-run`

Expected: output includes `src/cli.ts`, `src/init.ts`, and the managed `.sandcastle/` files. It should not include `.sandcastle/.env` or `.sandcastle/logs/*`.

- [ ] **Step 3: Commit package metadata**

```bash
git add package.json package-lock.json
git commit -m "chore: package sandcastle init binary"
```

---

### Task 5: End-to-End Verification

**Files:**
- Modify only if verification exposes a bug in prior files.
- Test: full local test suite and dry-run initializer.

- [ ] **Step 1: Run typecheck and tests**

Run: `npm run ci`

Expected: PASS.

- [ ] **Step 2: Test the binary against a temporary target repository without installing dependencies**

Run:

```bash
tmpdir="$(mktemp -d)"
printf '{ "name": "target", "version": "1.0.0" }\n' > "$tmpdir/package.json"
printf 'ghp_test_value\n' | npm exec --yes -- tsx src/cli.ts --no-install --prefix "$tmpdir"
```

If `--prefix` is not passed through by `npm exec` as desired, run this equivalent command instead:

```bash
tmpdir="$(mktemp -d)"
printf '{ "name": "target", "version": "1.0.0" }\n' > "$tmpdir/package.json"
cd "$tmpdir"
printf 'ghp_test_value\n' | node /Users/liamcarlin/Documents/sandcastle/node_modules/.bin/tsx /Users/liamcarlin/Documents/sandcastle/src/cli.ts --no-install
```

Expected: `.sandcastle/.env` exists in the temp repo and contains `GH_TOKEN=ghp_test_value`; package scripts are present.

- [ ] **Step 3: Commit any verification fixes**

If Step 1 or 2 required fixes:

```bash
git add src test package.json package-lock.json
git commit -m "fix: verify sandcastle init packaging"
```

If no fixes were required, do not create an empty commit.

---

## Self-Review

Spec coverage:

- `npx sandcastle-init` package and binary: Task 4.
- Copy managed `.sandcastle/` files and exclude `.env`/logs: Tasks 1 and 2.
- Create/update `.sandcastle/.env` from `.env.example`: Tasks 1 and 2.
- Prompt for `GH_TOKEN` without logging it: Task 3.
- Add scripts and dependencies idempotently: Tasks 1 and 2.
- Detect package manager and install dependencies: Tasks 1 and 2.
- Verify package contents and full tests: Tasks 4 and 5.

Placeholder scan: no placeholder tasks remain; each task names exact files, commands, and expected outcomes.

Type consistency: `initSandcastle`, `InitSandcastleOptions`, `createCli`, and injected `runCommand` signatures are consistent across tasks.
