import { describe, expect, it } from "vitest";

import { createCli } from "../src/cli.js";

describe("cli", () => {
  it("prints a greeting for the provided name argument", async () => {
    const output: string[] = [];
    const cli = createCli((line) => output.push(line));

    await cli.parseAsync(["node", "sandcastle", "Ada"]);

    expect(output).toEqual(["Hello, Ada!"]);
  });

  it("prints a default greeting when no name is provided", async () => {
    const output: string[] = [];
    const cli = createCli((line) => output.push(line));

    await cli.parseAsync(["node", "sandcastle"]);

    expect(output).toEqual(["Hello, world!"]);
  });
});
