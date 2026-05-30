#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { stdin as inputStream, stdout as outputStream } from "node:process";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { initSandcastle } from "./init.js";
export class PromptCancelledError extends Error {
    constructor() {
        super("Input cancelled");
        this.name = "PromptCancelledError";
    }
}
function isPromptCancelledError(error) {
    return error instanceof PromptCancelledError;
}
export async function promptSecretInput(question, options = {}) {
    const input = options.input ?? inputStream;
    const output = options.output ?? outputStream;
    output.write(question);
    return await new Promise((resolve, reject) => {
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
        const onError = (error) => {
            if (settled) {
                return;
            }
            settled = true;
            cleanup();
            reject(error);
        };
        const onData = (chunk) => {
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
export function createCli(options = {}) {
    const writeLine = options.writeLine ?? console.log;
    const readInput = options.input ?? promptSecretInput;
    const targetDir = options.cwd ?? process.cwd();
    const program = new Command();
    program
        .name("sandcastle-init")
        .description("prepares repo for Sandcastle automation")
        .option("--no-install", "skip package manager install")
        .action(async (commandOptions) => {
        let ghToken;
        try {
            ghToken = await readInput("Paste GH_TOKEN for GitHub Issues access: ");
        }
        catch (error) {
            if (isPromptCancelledError(error)) {
                program.error("Input cancelled.", {
                    code: "prompt.cancelled",
                    exitCode: 130,
                });
            }
            throw error;
        }
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
function isDirectCliInvocation(metaUrl, argvPath) {
    if (!argvPath) {
        return false;
    }
    return realpathSync(fileURLToPath(metaUrl)) === realpathSync(argvPath);
}
if (isDirectCliInvocation(import.meta.url, process.argv[1])) {
    await createCli().parseAsync(process.argv);
}
