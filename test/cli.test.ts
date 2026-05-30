import { describe, expect, it } from "vitest";

import { createCli } from "../src/cli.js";

async function runCli(args: string[]): Promise<string[]> {
  const output: string[] = [];
  const cli = createCli((line) => output.push(line));

  await cli.parseAsync(["node", "sandcastle", ...args]);

  return output;
}

describe("cli", () => {
  it("prints a greeting for the provided name argument", async () => {
    await expect(runCli(["Ada"])).resolves.toEqual(["Hello, Ada!"]);
  });

  it("prints a default greeting when no name is provided", async () => {
    await expect(runCli([])).resolves.toEqual(["Hello, world!"]);
  });
});
