import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type WriteLine = (line: string) => void;
type RunCommand = (
  command: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
) => Promise<void> | void;

export interface InitSandcastleOptions {
  targetDir: string;
  ghToken?: string;
  install?: boolean;
  dockerBuild?: boolean;
  yes?: boolean;
  codexPreflight?: boolean;
  confirm?: (question: string) => Promise<boolean>;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  runCommand?: RunCommand;
  writeLine?: WriteLine;
}

export interface InitSandcastleResult {
  imageTag: string;
  ghTokenSource: "argument" | "environment" | "env-file";
}

const managedTemplateFiles = [
  ".env.example",
  ".gitignore",
  "CODING_STANDARDS.md",
  "Dockerfile",
  "automation-config.mjs",
  "automation-config.test.mjs",
  "main.mts",
  "implement-prompt.md",
  "merge-prompt.md",
  "plan-prompt.md",
  "review-prompt.md",
] as const;

const requiredDevDependencies: Record<string, string> = {
  "@ai-hero/sandcastle": "^0.6.6",
  tsx: "^4.20.6",
  zod: "^4.4.3",
};

const requiredScripts: Record<string, string> = {
  sandcastle: "npx tsx --env-file=.sandcastle/.env .sandcastle/main.mts",
  "test:sandcastle": "node --test .sandcastle/*.test.mjs",
};

const sandcastleGitignoreFallback = ".env\nlogs/\nworktrees/\n";

const labelName = "Sandcastle";
const labelDescription = "Issues ready for Sandcastle automation";
const labelColor = "0969da";

export async function initSandcastle(options: InitSandcastleOptions): Promise<InitSandcastleResult> {
  const targetDir = options.targetDir;
  const run = options.runCommand ?? runCommand;
  const env = options.env ?? process.env;
  const writeLine = options.writeLine ?? (() => undefined);

  const packageJson = await readPackageJson(targetDir);
  const packageManager = await detectPackageManager(targetDir);
  const imageTag = `sandcastle-${normalizeDockerName(readRepoName(targetDir, packageJson))}:latest`;

  await copyManagedTemplates(targetDir);
  const token = await resolveGhToken(targetDir, options.ghToken, env);
  await ensureEnv(targetDir, token.value);
  await writeEnvValue(targetDir, "SANDCASTLE_DOCKER_IMAGE", imageTag);
  await updatePackageJson(targetDir, packageJson);

  if (options.install !== false) {
    writeLine(`Running ${packageManager} install`);
    await run(packageManager, ["install"], { cwd: targetDir });
    writeLine(`Running ${packageManager} run test:sandcastle`);
    await run(packageManager, ["run", "test:sandcastle"], { cwd: targetDir });
  }

  await setupGitHubLabel(targetDir, token.value, run, env);

  if (options.dockerBuild !== false) {
    await setupDockerImage(targetDir, imageTag, options, run, writeLine);
  }

  if (options.codexPreflight !== false) {
    await runCodexPreflight(targetDir, options.homeDir ?? homedir(), run);
  }

  return {
    imageTag,
    ghTokenSource: token.source,
  };
}

async function readPackageJson(targetDir: string): Promise<Record<string, unknown>> {
  const packagePath = join(targetDir, "package.json");

  try {
    const parsed = JSON.parse(await readFile(packagePath, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("package.json must contain an object");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    const cause = error instanceof Error ? `: ${error.message}` : "";
    throw new Error(`package.json is required${cause}`);
  }
}

async function copyManagedTemplates(targetDir: string): Promise<void> {
  const sourceDir = findTemplateDir();
  const targetSandcastleDir = join(targetDir, ".sandcastle");

  await mkdir(targetSandcastleDir, { recursive: true });

  await Promise.all(
    managedTemplateFiles.map((file) => copyManagedTemplate(sourceDir, targetSandcastleDir, file)),
  );
}

async function copyManagedTemplate(
  sourceDir: string,
  targetDir: string,
  file: (typeof managedTemplateFiles)[number],
): Promise<void> {
  const sourcePath = join(sourceDir, file);
  const targetPath = join(targetDir, file);

  if (file !== ".gitignore" || (await exists(sourcePath))) {
    await copyFile(sourcePath, targetPath);
    return;
  }

  await writeFile(targetPath, sandcastleGitignoreFallback);
}

function findTemplateDir(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  return join(moduleDir, "..", ".sandcastle");
}

async function ensureEnv(targetDir: string, ghToken: string): Promise<void> {
  const sandcastleDir = join(targetDir, ".sandcastle");
  const envPath = join(sandcastleDir, ".env");
  const examplePath = join(sandcastleDir, ".env.example");

  if (!(await exists(envPath))) {
    await copyFile(examplePath, envPath);
  }

  const trimmedToken = ghToken.trim();
  if (trimmedToken.length === 0) {
    return;
  }

  const env = await readFile(envPath, "utf8");
  await writeFile(envPath, upsertEnvValue(env, "GH_TOKEN", trimmedToken));
}

async function writeEnvValue(targetDir: string, key: string, value: string): Promise<void> {
  const envPath = join(targetDir, ".sandcastle", ".env");
  const env = await readFile(envPath, "utf8");
  await writeFile(envPath, upsertEnvValue(env, key, value));
}

async function resolveGhToken(
  targetDir: string,
  ghToken: string | undefined,
  env: NodeJS.ProcessEnv,
): Promise<{ value: string; source: InitSandcastleResult["ghTokenSource"] }> {
  const trimmedArgument = ghToken?.trim();
  if (trimmedArgument) {
    return { value: trimmedArgument, source: "argument" };
  }

  const envPath = join(targetDir, ".sandcastle", ".env");
  if (await exists(envPath)) {
    const existing = readEnvValue(await readFile(envPath, "utf8"), "GH_TOKEN");
    if (existing) {
      return { value: existing, source: "env-file" };
    }
  }

  const envToken = env.GH_TOKEN?.trim();
  if (envToken) {
    return { value: envToken, source: "environment" };
  }

  throw new Error("GH_TOKEN is required to initialize Sandcastle");
}

function readEnvValue(env: string, key: string): string | undefined {
  const line = env.split(/\r?\n/).find((entry) => entry.startsWith(`${key}=`));
  const value = line?.slice(key.length + 1).trim();
  return value || undefined;
}

function upsertEnvValue(env: string, key: string, value: string): string {
  const lines = env.split(/\r?\n/);
  const index = lines.findIndex((line) => line.startsWith(`${key}=`));

  if (index >= 0) {
    lines[index] = `${key}=${value}`;
    return lines.join("\n");
  }

  const suffix = env.endsWith("\n") || env.length === 0 ? "" : "\n";
  return `${env}${suffix}${key}=${value}\n`;
}

async function updatePackageJson(
  targetDir: string,
  packageJson: Record<string, unknown>,
): Promise<void> {
  const scripts = objectValue(packageJson.scripts);
  packageJson.scripts = scripts;
  for (const [name, command] of Object.entries(requiredScripts)) {
    scripts[name] = command;
  }

  const devDependencies = objectValue(packageJson.devDependencies);
  const dependencies = objectValue(packageJson.dependencies);
  packageJson.devDependencies = devDependencies;
  for (const [name, version] of Object.entries(requiredDevDependencies)) {
    if (!(name in dependencies) && !(name in devDependencies)) {
      devDependencies[name] = version;
    }
  }

  await writeFile(join(targetDir, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);
}

function objectValue(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, string>;
}

async function detectPackageManager(targetDir: string): Promise<string> {
  if (await exists(join(targetDir, "pnpm-lock.yaml"))) {
    return "pnpm";
  }
  if (await exists(join(targetDir, "yarn.lock"))) {
    return "yarn";
  }
  return "npm";
}

function readRepoName(targetDir: string, packageJson: Record<string, unknown>): string {
  const packageName = packageJson.name;
  if (typeof packageName === "string" && packageName.trim()) {
    return packageName;
  }
  return basename(targetDir);
}

export function normalizeDockerName(name: string): string {
  const normalized = name
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "repo";
}

async function setupGitHubLabel(
  targetDir: string,
  ghToken: string,
  run: RunCommand,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  await run("gh", ["--version"], { cwd: targetDir });

  try {
    await run(
      "gh",
      [
        "label",
        "create",
        labelName,
        "--color",
        labelColor,
        "--description",
        labelDescription,
      ],
      { cwd: targetDir, env: { ...env, GH_TOKEN: ghToken } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/already exists/i.test(message)) {
      return;
    }
    throw new Error("GH_TOKEN could not create or read labels for this repo. Check token permissions.");
  }
}

async function setupDockerImage(
  targetDir: string,
  imageTag: string,
  options: InitSandcastleOptions,
  run: RunCommand,
  writeLine: WriteLine,
): Promise<void> {
  await run("docker", ["version"], { cwd: targetDir });

  let imageExists = true;
  try {
    await run("docker", ["image", "inspect", imageTag], { cwd: targetDir });
  } catch {
    imageExists = false;
  }

  const shouldBuild =
    !imageExists ||
    options.yes === true ||
    (await (options.confirm ?? defaultConfirm)(
      `Docker image ${imageTag} already exists. Rebuild it? [Y/n] `,
    ));

  if (!shouldBuild) {
    writeLine(`Using existing Docker image ${imageTag}`);
    return;
  }

  writeLine(`Building Docker image ${imageTag}`);
  await run("docker", ["build", "-t", imageTag, "-f", ".sandcastle/Dockerfile", "."], {
    cwd: targetDir,
  });
}

async function defaultConfirm(): Promise<boolean> {
  return true;
}

async function runCodexPreflight(
  targetDir: string,
  homeDir: string,
  run: RunCommand,
): Promise<void> {
  await run("codex", ["--version"], { cwd: targetDir });

  if (
    !(await exists(join(homeDir, ".codex", "auth.json"))) ||
    !(await exists(join(homeDir, ".codex", "config.toml")))
  ) {
    throw new Error("Codex CLI login files were not found. Run codex login and rerun sandcastle-init.");
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function runCommand(
  command: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} failed with ${signal ?? `exit code ${code}`}`));
    });
  });
}
