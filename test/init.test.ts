import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { initSandcastle } from "../src/init.js";

const targetDirs: string[] = [];

async function makeTarget(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "sandcastle-init-"));
  targetDirs.push(dir);
  await writeFile(join(dir, "package.json"), JSON.stringify({ name: "target", version: "1.0.0" }, null, 2));
  return dir;
}

describe("initSandcastle", () => {
  afterEach(async () => {
    await Promise.all(targetDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("refuses to run without package.json", async () => {
    const targetDir = await mkdtemp(join(tmpdir(), "sandcastle-init-empty-"));
    targetDirs.push(targetDir);

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

  it.each([
    { lockfile: undefined, command: "npm" },
    { lockfile: "pnpm-lock.yaml", command: "pnpm" },
    { lockfile: "yarn.lock", command: "yarn" },
  ])("runs $command install when $lockfile is present", async ({ lockfile, command }) => {
    const targetDir = await makeTarget();
    const commands: Array<{ command: string; args: string[]; cwd: string }> = [];
    if (lockfile) {
      await writeFile(join(targetDir, lockfile), "");
    }

    await initSandcastle({
      targetDir,
      ghToken: "ghp_test",
      install: true,
      runCommand: async (command, args, options) => {
        commands.push({ command, args, cwd: options.cwd });
      },
    });

    expect(commands).toEqual([{ command, args: ["install"], cwd: targetDir }]);
  });
});
