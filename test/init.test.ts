import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { initSandcastle, normalizeDockerName } from "../src/init.js";

const targetDirs: string[] = [];
const noopRunCommand = async () => undefined;

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

  it("creates package.json when initializing a non-Node repo", async () => {
    const targetDir = await mkdtemp(join(tmpdir(), "sandcastle-init-empty-"));
    targetDirs.push(targetDir);

    await initSandcastle({
      targetDir,
      ghToken: "ghp_test",
      install: false,
      dockerBuild: false,
      codexPreflight: false,
      runCommand: noopRunCommand,
    });

    const packageJson = JSON.parse(await readFile(join(targetDir, "package.json"), "utf8"));
    expect(packageJson.name).toMatch(/^sandcastle-init-empty-/);
    expect(packageJson.private).toBe(true);
    expect(packageJson.type).toBe("module");
    expect(packageJson.scripts.sandcastle).toBe("npx tsx --env-file=.sandcastle/.env .sandcastle/main.mts");
    expect(packageJson.devDependencies["@ai-hero/sandcastle"]).toBeDefined();
  });

  it("refuses to run with invalid package.json", async () => {
    const targetDir = await mkdtemp(join(tmpdir(), "sandcastle-init-invalid-"));
    targetDirs.push(targetDir);
    await writeFile(join(targetDir, "package.json"), "{");

    await expect(
      initSandcastle({
        targetDir,
        ghToken: "ghp_test",
        install: false,
        dockerBuild: false,
      }),
    ).rejects.toThrow("package.json is invalid");
  });

  it("copies managed template files and excludes runtime files", async () => {
    const targetDir = await makeTarget();

    await initSandcastle({
      targetDir,
      ghToken: "ghp_test",
      install: false,
      dockerBuild: false,
      codexPreflight: false,
      runCommand: noopRunCommand,
    });

    await expect(readFile(join(targetDir, ".sandcastle/main.mts"), "utf8")).resolves.toContain(
      "Parallel Planner with Review",
    );
    await expect(readFile(join(targetDir, ".sandcastle/logs/main-preflight.log"), "utf8")).rejects.toThrow();
  });

  it("passes issue context and base branch into the reviewer prompt without overriding built-ins", async () => {
    const targetDir = await makeTarget();

    await initSandcastle({
      targetDir,
      ghToken: "ghp_test",
      install: false,
      dockerBuild: false,
      codexPreflight: false,
      runCommand: noopRunCommand,
    });

    const main = await readFile(join(targetDir, ".sandcastle/main.mts"), "utf8");
    const reviewPrompt = await readFile(join(targetDir, ".sandcastle/review-prompt.md"), "utf8");
    expect(main).toContain("const targetBranch =");
    expect(main).toContain("TASK_ID: issue.id");
    expect(main).toContain("ISSUE_TITLE: issue.title");
    expect(main).toContain("BASE_BRANCH: targetBranch");
    expect(main).not.toContain("TARGET_BRANCH: targetBranch");
    expect(reviewPrompt).toContain("{{BASE_BRANCH}}");
    expect(reviewPrompt).not.toContain("{{TARGET_BRANCH}}");
  });

  it("stops instead of replanning the same open issue when no commits were produced", async () => {
    const targetDir = await makeTarget();

    await initSandcastle({
      targetDir,
      ghToken: "ghp_test",
      install: false,
      dockerBuild: false,
      codexPreflight: false,
      runCommand: noopRunCommand,
    });

    const main = await readFile(join(targetDir, ".sandcastle/main.mts"), "utf8");
    expect(main).toContain('console.log("No commits produced. Nothing to merge.");\n    break;');
  });

  it("fails the run when an issue pipeline rejects", async () => {
    const targetDir = await makeTarget();

    await initSandcastle({
      targetDir,
      ghToken: "ghp_test",
      install: false,
      dockerBuild: false,
      codexPreflight: false,
      runCommand: noopRunCommand,
    });

    const main = await readFile(join(targetDir, ".sandcastle/main.mts"), "utf8");
    expect(main).toContain("const failedIssues = settled");
    expect(main).toContain('throw new Error(`Issue pipeline failed for ${failedIssues.join(", ")}`);');
  });

  it("passes paired merge candidates into the merger prompt", async () => {
    const targetDir = await makeTarget();

    await initSandcastle({
      targetDir,
      ghToken: "ghp_test",
      install: false,
      dockerBuild: false,
      codexPreflight: false,
      runCommand: noopRunCommand,
    });

    const main = await readFile(join(targetDir, ".sandcastle/main.mts"), "utf8");
    expect(main).toContain("MERGE_CANDIDATES:");
    expect(main).toContain("from ${i.branch}");
  });

  it("allows merge when pre-existing dirty files do not overlap the candidate branch", async () => {
    const targetDir = await makeTarget();

    await initSandcastle({
      targetDir,
      ghToken: "ghp_test",
      install: false,
      dockerBuild: false,
      codexPreflight: false,
      runCommand: noopRunCommand,
    });

    const mergePrompt = await readFile(join(targetDir, ".sandcastle/merge-prompt.md"), "utf8");
    expect(mergePrompt).toContain("Do not skip solely because the target worktree is dirty.");
    expect(mergePrompt).toContain("git diff --name-only HEAD...<branch>");
    expect(mergePrompt).toContain("when a dirty path overlaps the candidate branch diff");
    expect(mergePrompt).not.toContain("The target worktree must be clean except for files");
    expect(mergePrompt).not.toContain("target worktree is dirty before the merge starts with unrelated");
  });

  it("creates .env from the example and writes the provided GH_TOKEN", async () => {
    const targetDir = await makeTarget();

    await initSandcastle({
      targetDir,
      ghToken: "ghp_secret_value",
      install: false,
      dockerBuild: false,
      codexPreflight: false,
      runCommand: noopRunCommand,
    });

    const env = await readFile(join(targetDir, ".sandcastle/.env"), "utf8");
    expect(env).toContain("CODEX_MODEL=gpt-5.5");
    expect(env).toContain("GH_TOKEN=ghp_secret_value");
    expect(env).toContain("SANDCASTLE_DOCKER_IMAGE=sandcastle-target:latest");
  });

  it("preserves an existing .env when token input is empty", async () => {
    const targetDir = await makeTarget();
    await initSandcastle({
      targetDir,
      ghToken: "ghp_original",
      install: false,
      dockerBuild: false,
      codexPreflight: false,
      runCommand: noopRunCommand,
    });

    await initSandcastle({
      targetDir,
      ghToken: "",
      install: false,
      dockerBuild: false,
      codexPreflight: false,
      runCommand: noopRunCommand,
    });

    const env = await readFile(join(targetDir, ".sandcastle/.env"), "utf8");
    expect(env).toContain("GH_TOKEN=ghp_original");
  });

  it("updates an existing GH_TOKEN when a new token is entered", async () => {
    const targetDir = await makeTarget();
    await initSandcastle({
      targetDir,
      ghToken: "ghp_original",
      install: false,
      dockerBuild: false,
      codexPreflight: false,
      runCommand: noopRunCommand,
    });

    await initSandcastle({
      targetDir,
      ghToken: "ghp_replacement",
      install: false,
      dockerBuild: false,
      codexPreflight: false,
      runCommand: noopRunCommand,
    });

    const env = await readFile(join(targetDir, ".sandcastle/.env"), "utf8");
    expect(env).toContain("GH_TOKEN=ghp_replacement");
    expect(env).not.toContain("ghp_original");
  });

  it("adds scripts and devDependencies idempotently", async () => {
    const targetDir = await makeTarget();

    await initSandcastle({
      targetDir,
      ghToken: "ghp_test",
      install: false,
      dockerBuild: false,
      codexPreflight: false,
      runCommand: noopRunCommand,
    });
    await initSandcastle({
      targetDir,
      ghToken: "ghp_test",
      install: false,
      dockerBuild: false,
      codexPreflight: false,
      runCommand: noopRunCommand,
    });

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
      dockerBuild: false,
      codexPreflight: false,
      runCommand: async (command, args, options) => {
        commands.push({ command, args, cwd: options.cwd });
      },
    });

    expect(commands.slice(0, 2)).toEqual([
      { command, args: ["install"], cwd: targetDir },
      { command, args: ["run", "test:sandcastle"], cwd: targetDir },
    ]);
  });

  it("normalizes repository names for Docker image tags", () => {
    expect(normalizeDockerName("@Scope/My Repo_Name")).toBe("scope-my-repo-name");
    expect(normalizeDockerName("...")).toBe("repo");
  });

  it("uses an existing .env GH_TOKEN without requiring a new token", async () => {
    const targetDir = await makeTarget();
    const commands: Array<{ command: string; args: string[]; env?: string }> = [];

    await initSandcastle({
      targetDir,
      ghToken: "ghp_existing",
      install: false,
      dockerBuild: false,
      codexPreflight: false,
      runCommand: noopRunCommand,
    });
    await initSandcastle({
      targetDir,
      install: false,
      dockerBuild: false,
      codexPreflight: false,
      runCommand: async (command, args, options) => {
        commands.push({ command, args, env: options.env?.GH_TOKEN });
      },
    });

    expect(commands).toContainEqual({
      command: "gh",
      args: [
        "label",
        "create",
        "Sandcastle",
        "--color",
        "0969da",
        "--description",
        "Issues ready for Sandcastle automation",
      ],
      env: "ghp_existing",
    });
  });

  it("creates the Sandcastle GitHub label with GH_TOKEN in the child environment", async () => {
    const targetDir = await makeTarget();
    const commands: Array<{ command: string; args: string[]; env?: string }> = [];

    await initSandcastle({
      targetDir,
      ghToken: "ghp_label",
      install: false,
      dockerBuild: false,
      codexPreflight: false,
      runCommand: async (command, args, options) => {
        commands.push({ command, args, env: options.env?.GH_TOKEN });
      },
    });

    expect(commands).toContainEqual({
      command: "gh",
      args: [
        "label",
        "create",
        "Sandcastle",
        "--color",
        "0969da",
        "--description",
        "Issues ready for Sandcastle automation",
      ],
      env: "ghp_label",
    });
    expect(commands.flatMap((entry) => entry.args)).not.toContain("ghp_label");
  });

  it("treats an existing Sandcastle label as success", async () => {
    const targetDir = await makeTarget();

    await expect(
      initSandcastle({
        targetDir,
        ghToken: "ghp_label",
        install: false,
        dockerBuild: false,
        codexPreflight: false,
        runCommand: async (command, args) => {
          if (command === "gh" && args.includes("create")) {
            throw new Error("label already exists");
          }
        },
      }),
    ).resolves.toBeDefined();
  });

  it("builds a new repo-specific Docker image when no image exists", async () => {
    const targetDir = await makeTarget();
    const homeDir = await mkdtemp(join(tmpdir(), "sandcastle-home-"));
    targetDirs.push(homeDir);
    await mkdir(join(homeDir, ".codex"), { recursive: true });
    await writeFile(join(homeDir, ".codex/auth.json"), "{}");
    await writeFile(join(homeDir, ".codex/config.toml"), "");
    const commands: Array<{ command: string; args: string[] }> = [];

    const result = await initSandcastle({
      targetDir,
      ghToken: "ghp_docker",
      install: false,
      homeDir,
      hostUid: 501,
      hostGid: 20,
      runCommand: async (command, args) => {
        commands.push({ command, args });
        if (command === "docker" && args[0] === "image") {
          throw new Error("No such image");
        }
      },
    });

    expect(result.imageTag).toBe("sandcastle-target:latest");
    expect(commands).toContainEqual({ command: "docker", args: ["version"] });
    expect(commands).toContainEqual({
      command: "docker",
      args: [
        "build",
        "-t",
        "sandcastle-target:latest",
        "--build-arg",
        "AGENT_UID=501",
        "--build-arg",
        "AGENT_GID=20",
        "-f",
        ".sandcastle/Dockerfile",
        ".",
      ],
    });
  });

  it("asks before rebuilding an existing Docker image", async () => {
    const targetDir = await makeTarget();
    const commands: Array<{ command: string; args: string[] }> = [];
    const questions: string[] = [];

    await initSandcastle({
      targetDir,
      ghToken: "ghp_docker",
      install: false,
      homeDir: tmpdir(),
      confirm: async (question) => {
        questions.push(question);
        return false;
      },
      runCommand: async (command, args) => {
        commands.push({ command, args });
      },
      dockerBuild: true,
      codexPreflight: false,
      hostUid: 501,
      hostGid: 20,
    });

    expect(questions[0]).toContain("sandcastle-target:latest");
    expect(commands).not.toContainEqual({
      command: "docker",
      args: [
        "build",
        "-t",
        "sandcastle-target:latest",
        "--build-arg",
        "AGENT_UID=501",
        "--build-arg",
        "AGENT_GID=20",
        "-f",
        ".sandcastle/Dockerfile",
        ".",
      ],
    });
  });

  it("rebuilds an existing Docker image without asking when yes is true", async () => {
    const targetDir = await makeTarget();
    const commands: Array<{ command: string; args: string[] }> = [];

    await initSandcastle({
      targetDir,
      ghToken: "ghp_docker",
      install: false,
      dockerBuild: true,
      codexPreflight: false,
      hostUid: 501,
      hostGid: 20,
      yes: true,
      confirm: async () => {
        throw new Error("confirm should not be called");
      },
      runCommand: async (command, args) => {
        commands.push({ command, args });
      },
    });

    expect(commands).toContainEqual({
      command: "docker",
      args: [
        "build",
        "-t",
        "sandcastle-target:latest",
        "--build-arg",
        "AGENT_UID=501",
        "--build-arg",
        "AGENT_GID=20",
        "-f",
        ".sandcastle/Dockerfile",
        ".",
      ],
    });
  });

  it("skips Docker commands when dockerBuild is false", async () => {
    const targetDir = await makeTarget();
    const commands: Array<{ command: string; args: string[] }> = [];

    await initSandcastle({
      targetDir,
      ghToken: "ghp_skip",
      install: false,
      dockerBuild: false,
      codexPreflight: false,
      runCommand: async (command, args) => {
        commands.push({ command, args });
      },
    });

    expect(commands.some((entry) => entry.command === "docker")).toBe(false);
  });

  it("fails Codex preflight when login files are missing", async () => {
    const targetDir = await makeTarget();
    const homeDir = await mkdtemp(join(tmpdir(), "sandcastle-home-"));
    targetDirs.push(homeDir);

    await expect(
      initSandcastle({
        targetDir,
        ghToken: "ghp_codex",
        install: false,
        dockerBuild: false,
        homeDir,
        runCommand: noopRunCommand,
      }),
    ).rejects.toThrow("Codex CLI login files were not found");
  });
});
