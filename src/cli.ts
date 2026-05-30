#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { stdin as inputStream, stdout as outputStream } from "node:process";
import { createInterface } from "node:readline/promises";
import type { Readable, Writable } from "node:stream";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Command } from "commander";

import { initSandcastle, type InitSandcastleOptions } from "./init.js";

type Input = (question: string) => Promise<string>;
type WriteLine = (line: string) => void;
type SecretInputStream = Readable & {
  isRaw?: boolean;
  isTTY?: boolean;
  setRawMode?: (mode: boolean) => void;
};

export interface CliOptions {
  cwd?: string;
  input?: Input;
  confirm?: (question: string) => Promise<boolean>;
  writeLine?: WriteLine;
  install?: boolean;
  dockerBuild?: boolean;
  yes?: boolean;
  env?: NodeJS.ProcessEnv;
  runCommand?: InitSandcastleOptions["runCommand"];
  codexPreflight?: boolean;
}

interface SecretInputOptions {
  input?: SecretInputStream;
  output?: Writable;
}

export class PromptCancelledError extends Error {
  constructor() {
    super("Input cancelled");
    this.name = "PromptCancelledError";
  }
}

function isPromptCancelledError(error: unknown): error is PromptCancelledError {
  return error instanceof PromptCancelledError;
}

export async function promptSecretInput(
  question: string,
  options: SecretInputOptions = {},
): Promise<string> {
  const input = options.input ?? inputStream;
  const output = options.output ?? outputStream;

  output.write(question);

  return await new Promise<string>((resolve, reject) => {
    let token = "";
    let settled = false;
    const wasRaw = input.isRaw === true;
    const canSetRawMode = input.isTTY === true && typeof input.setRawMode === "function";

    const cleanup = () => {
      input.off("data", onData);
      input.off("error", onError);
      if (canSetRawMode) {
        input.setRawMode?.(wasRaw);
      }
      input.pause();
    };

    const finish = () => {
      if (settled) {
        return;
      }

      settled = true;
      output.write("\n");
      cleanup();
      resolve(token);
    };

    const cancel = () => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      output.write("\n");
      reject(new PromptCancelledError());
    };

    const onError = (error: Error) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      reject(error);
    };

    const onData = (chunk: Buffer | string) => {
      const characters = String(chunk);

      for (const character of characters) {
        if (character === "\u0003") {
          cancel();
          return;
        }

        if (character === "\n" || character === "\r") {
          finish();
          return;
        }

        if (character === "\b" || character === "\u007f") {
          token = token.slice(0, -1);
          continue;
        }

        token += character;
      }
    };

    input.on("data", onData);
    input.on("error", onError);

    if (canSetRawMode) {
      input.setRawMode?.(true);
    }

    input.resume();
  });
}

export async function promptConfirm(question: string): Promise<boolean> {
  const readline = createInterface({ input: inputStream, output: outputStream });
  try {
    const answer = (await readline.question(question)).trim().toLowerCase();
    return answer === "" || answer === "y" || answer === "yes";
  } finally {
    readline.close();
  }
}

async function hasExistingGhToken(targetDir: string, env: NodeJS.ProcessEnv): Promise<boolean> {
  if (env.GH_TOKEN?.trim()) {
    return true;
  }

  try {
    const contents = await readFile(join(targetDir, ".sandcastle", ".env"), "utf8");
    return contents
      .split(/\r?\n/)
      .some((line) => line.startsWith("GH_TOKEN=") && line.slice("GH_TOKEN=".length).trim());
  } catch {
    return false;
  }
}

export function createCli(options: CliOptions = {}): Command {
  const writeLine = options.writeLine ?? console.log;
  const readInput = options.input ?? promptSecretInput;
  const confirm = options.confirm ?? promptConfirm;
  const targetDir = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;

  const program = new Command();

  program
    .name("sandcastle-init")
    .description("prepares repo for Sandcastle automation")
    .option("--no-install", "skip package manager install")
    .option("--no-docker-build", "skip Docker image checks and build")
    .option("--yes", "accept setup defaults and rebuild an existing Docker image")
    .action(async (commandOptions: { install: boolean; dockerBuild: boolean; yes?: boolean }) => {
      let ghToken = "";

      if (!(await hasExistingGhToken(targetDir, env))) {
        try {
          ghToken = await readInput("Paste GH_TOKEN for GitHub Issues access: ");
        } catch (error) {
          if (isPromptCancelledError(error)) {
            program.error("Input cancelled.", {
              code: "prompt.cancelled",
              exitCode: 130,
            });
          }

          throw error;
        }
      }

      const install = options.install ?? commandOptions.install;
      const dockerBuild = options.dockerBuild ?? commandOptions.dockerBuild;
      const yes = options.yes ?? commandOptions.yes === true;

      const result = await initSandcastle({
        targetDir,
        ghToken,
        install,
        dockerBuild,
        yes,
        confirm,
        env,
        runCommand: options.runCommand,
        codexPreflight: options.codexPreflight,
        writeLine,
      });

      writeLine("Sandcastle initialized.");
      writeLine(`Docker image: ${result.imageTag}`);
      writeLine("Next steps:");
      writeLine("1. Run npm run sandcastle");
    });

  return program;
}

function isDirectCliInvocation(metaUrl: string, argvPath: string | undefined): boolean {
  if (!argvPath) {
    return false;
  }

  return realpathSync(fileURLToPath(metaUrl)) === realpathSync(argvPath);
}

if (isDirectCliInvocation(import.meta.url, process.argv[1])) {
  await createCli().parseAsync(process.argv);
}
