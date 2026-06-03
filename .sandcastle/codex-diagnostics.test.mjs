import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyCodexFailure,
  explainCodexFailure,
  runCodexPhase,
} from "./codex-diagnostics.mjs";

test("classifies websocket 403 failures as Codex auth failures", () => {
  const error = new Error(
    "AgentError: codex exited with code 1:\nfailed to connect to websocket: HTTP error: 403 Forbidden, url: wss://chatgpt.com/backend-api/codex/responses",
  );

  assert.equal(classifyCodexFailure(error), "auth");
  assert.match(explainCodexFailure("preflight", error), /Codex CLI authentication was rejected/);
  assert.match(explainCodexFailure("preflight", error), /not a usage cap/);
});

test("classifies quota and rate-limit failures as usage failures", () => {
  assert.equal(classifyCodexFailure(new Error("HTTP error: 429 rate limit exceeded")), "usage");
  assert.equal(classifyCodexFailure(new Error("usage limit reached")), "usage");
});

test("retries transient Codex startup failures", async () => {
  let attempts = 0;

  const result = await runCodexPhase(
    "planner",
    async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("failed to refresh available models: timeout waiting for child process to exit");
      }
      return "ok";
    },
    { maxAttempts: 2, retryDelayMs: 0 },
  );

  assert.equal(result, "ok");
  assert.equal(attempts, 2);
});

test("does not retry Codex auth failures", async () => {
  let attempts = 0;

  await assert.rejects(
    () =>
      runCodexPhase(
        "preflight",
        async () => {
          attempts += 1;
          throw new Error("HTTP error: 403 Forbidden, url: wss://chatgpt.com/backend-api/codex/responses");
        },
        { maxAttempts: 3, retryDelayMs: 0 },
      ),
    /Codex CLI authentication was rejected/,
  );

  assert.equal(attempts, 1);
});
