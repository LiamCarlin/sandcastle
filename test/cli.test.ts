import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createCli } from "../src/cli.js";

async function createTargetRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "sandcastle-cli-"));
  await writeFile(join(dir, "package.json"), JSON.stringify({ name: "target-repo" }));
  return dir;
}

describe("cli", () => {
  it("initializes Sandcastle with an injected GitHub token without printing the token", async () => {
    const cwd = await createTargetRepo();
    const output: string[] = [];

    try {
      const cli = createCli({
        cwd,
        input: async () => "ghp_cli_secret",
        writeLine: (line) => output.push(line),
        install: false,
      });

      await cli.parseAsync(["node", "sandcastle-init"]);

      const env = await readFile(join(cwd, ".sandcastle", ".env"), "utf8");
      expect(env).toContain("GH_TOKEN=ghp_cli_secret");
      expect(output).toContain("Sandcastle initialized.");
      expect(output.join("\n")).not.toContain("ghp_cli_secret");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
