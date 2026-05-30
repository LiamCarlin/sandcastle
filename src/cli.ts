#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin as inputStream, stdout as outputStream } from "node:process";

import { Command } from "commander";

import { initSandcastle } from "./init.js";

type Input = (question: string) => Promise<string>;
type WriteLine = (line: string) => void;

export interface CliOptions {
  cwd?: string;
  input?: Input;
  writeLine?: WriteLine;
  install?: boolean;
}

async function promptInput(question: string): Promise<string> {
  const readline = createInterface({
    input: inputStream,
    output: outputStream,
  });

  try {
    return await readline.question(question);
  } finally {
    readline.close();
  }
}

export function createCli(options: CliOptions = {}): Command {
  const writeLine = options.writeLine ?? console.log;
  const readInput = options.input ?? promptInput;
  const targetDir = options.cwd ?? process.cwd();

  const program = new Command();

  program
    .name("sandcastle-init")
    .description("prepares repo for Sandcastle automation")
    .option("--no-install", "skip package manager install")
    .action(async (commandOptions: { install: boolean }) => {
      const ghToken = await readInput("Paste GH_TOKEN for GitHub Issues access: ");
      const install = options.install ?? commandOptions.install;

      await initSandcastle({
        targetDir,
        ghToken,
        install,
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
