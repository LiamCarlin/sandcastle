import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type WriteLine = (line: string) => void;
type RunCommand = (
  command: string,
  args: string[],
  options: { cwd: string },
) => Promise<void> | void;

export interface InitSandcastleOptions {
  targetDir: string;
  ghToken?: string;
  install?: boolean;
  runCommand?: RunCommand;
  writeLine?: WriteLine;
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

export async function initSandcastle(options: InitSandcastleOptions): Promise<void> {
  const targetDir = options.targetDir;

  const packageJson = await readPackageJson(targetDir);
  await copyManagedTemplates(targetDir);
  await ensureEnv(targetDir, options.ghToken ?? "");
  await updatePackageJson(targetDir, packageJson);

  if (options.install !== false) {
    const command = await detectInstallCommand(targetDir);
    options.writeLine?.(`Running ${command} install`);
    await (options.runCommand ?? runCommand)(command, ["install"], { cwd: targetDir });
  }
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
    managedTemplateFiles.map((file) =>
      copyFile(join(sourceDir, file), join(targetSandcastleDir, file)),
    ),
  );
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
  packageJson.devDependencies = devDependencies;
  for (const [name, version] of Object.entries(requiredDevDependencies)) {
    if (!(name in devDependencies)) {
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

async function detectInstallCommand(targetDir: string): Promise<string> {
  if (await exists(join(targetDir, "pnpm-lock.yaml"))) {
    return "pnpm";
  }
  if (await exists(join(targetDir, "yarn.lock"))) {
    return "yarn";
  }
  return "npm";
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
  options: { cwd: string },
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
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
