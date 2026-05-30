import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";

import { describe, expect, it } from "vitest";

import { createCli, promptSecretInput } from "../src/cli.js";

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

  it("reads the default GitHub token prompt without echoing input", async () => {
    const input = new PassThrough();
    const writes: string[] = [];
    const output = new Writable({
      write(chunk, _encoding, callback) {
        writes.push(String(chunk));
        callback();
      },
    });

    const token = promptSecretInput("Paste GH_TOKEN for GitHub Issues access: ", {
      input,
      output,
    });

    input.write("ghp_cli_secret\n");

    await expect(token).resolves.toBe("ghp_cli_secret");
    expect(writes.join("")).toBe("Paste GH_TOKEN for GitHub Issues access: \n");
  });
});
