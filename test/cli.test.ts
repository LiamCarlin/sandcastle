import { describe, expect, it } from "vitest";

import { createCli } from "../src/cli.js";

describe("cli", () => {
  it("prints a greeting for the provided name", async () => {
    const output: string[] = [];
    const cli = createCli((line) => output.push(line));

    await cli.parseAsync(["node", "workspace", "hello", "Ada"]);

    expect(output).toEqual(["Hello, Ada!"]);
  });
});
