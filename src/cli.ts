#!/usr/bin/env node
import { Command } from "commander";

import { createGreeting } from "./app.js";

export function createCli(writeLine = console.log): Command {
  const program = new Command();

  program
    .name("workspace")
    .description("A basic TypeScript CLI template")
    .version("0.1.0");

  program
    .command("hello")
    .description("Print a greeting")
    .argument("[name]", "name to greet", "world")
    .action((name: string) => {
      writeLine(createGreeting(name));
    });

  return program;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await createCli().parseAsync(process.argv);
}
