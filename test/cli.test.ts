import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";

import { describe, expect, it } from "vitest";

import { createCli, promptSecretInput } from "../src/cli.js";

class FakeTtyInput extends PassThrough {
  isTTY = true;
  isRaw: boolean;
  rawModeCalls: boolean[] = [];

  constructor(isRaw = false) {
    super();
    this.isRaw = isRaw;
  }

  setRawMode(mode: boolean): void {
    this.rawModeCalls.push(mode);
    this.isRaw = mode;
  }
}

function createRecordingOutput(): { output: Writable; writes: string[] } {
  const writes: string[] = [];
  const output = new Writable({
    write(chunk, _encoding, callback) {
      writes.push(String(chunk));
      callback();
    },
  });

  return { output, writes };
}

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
    const { output, writes } = createRecordingOutput();

    const token = promptSecretInput("Paste GH_TOKEN for GitHub Issues access: ", {
      input,
      output,
    });

    input.write("ghp_cli_secret\n");

    await expect(token).resolves.toBe("ghp_cli_secret");
    expect(writes.join("")).toBe("Paste GH_TOKEN for GitHub Issues access: \n");
  });

  it("enables raw mode for TTY input and restores the previous raw mode after Enter", async () => {
    const input = new FakeTtyInput(false);
    const { output, writes } = createRecordingOutput();

    const token = promptSecretInput("Token: ", { input, output });

    expect(input.rawModeCalls).toEqual([true]);
    input.write("ghp_cli_secret\n");

    await expect(token).resolves.toBe("ghp_cli_secret");
    expect(input.rawModeCalls).toEqual([true, false]);
    expect(input.isRaw).toBe(false);
    expect(writes.join("")).toBe("Token: \n");
    expect(writes.join("")).not.toContain("ghp_cli_secret");
    expect(input.listenerCount("data")).toBe(0);
    expect(input.listenerCount("error")).toBe(0);
  });

  it("restores raw mode and cleans up listeners when TTY input is cancelled with Ctrl+C", async () => {
    const input = new FakeTtyInput(true);
    const { output, writes } = createRecordingOutput();

    const token = promptSecretInput("Token: ", { input, output });

    expect(input.rawModeCalls).toEqual([true]);
    input.write("\u0003");

    await expect(token).rejects.toMatchObject({
      name: "PromptCancelledError",
      message: "Input cancelled",
    });
    expect(input.rawModeCalls).toEqual([true, true]);
    expect(input.isRaw).toBe(true);
    expect(writes.join("")).toBe("Token: \n");
    expect(input.listenerCount("data")).toBe(0);
    expect(input.listenerCount("error")).toBe(0);
  });
});
