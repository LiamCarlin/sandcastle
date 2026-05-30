import assert from "node:assert/strict";
import test from "node:test";

import {
  codexCredentialMounts,
  getAutomationConfig,
  limitIssuesForRun,
} from "./automation-config.mjs";

test("builds CLI-first automation config from environment", () => {
  const config = getAutomationConfig({
    CODEX_MODEL: "gpt-5.5",
    CODEX_EFFORT: "medium",
    MAX_PARALLEL_ISSUES: "2",
    GH_TOKEN: "gh-token",
  });

  assert.deepEqual(config, {
    codexModel: "gpt-5.5",
    codexEffort: "medium",
    maxParallelIssues: 2,
    ghToken: "gh-token",
  });
});

test("rejects model-provider API key configuration", () => {
  assert.throws(
    () =>
      getAutomationConfig({
        GH_TOKEN: "gh-token",
        OPENAI_KEY: "sk-test",
      }),
    /OPENAI_KEY is not supported/,
  );
});

test("limits issue run order deterministically by issue number", () => {
  const issues = [
    { id: "12", title: "Later", branch: "sandcastle/issue-12" },
    { id: "2", title: "Sooner", branch: "sandcastle/issue-2" },
    { id: "7", title: "Middle", branch: "sandcastle/issue-7" },
  ];

  assert.deepEqual(limitIssuesForRun(issues, 2), [
    { id: "2", title: "Sooner", branch: "sandcastle/issue-2" },
    { id: "7", title: "Middle", branch: "sandcastle/issue-7" },
  ]);
});

test("shares Codex login files without sharing writable Codex state", () => {
  assert.deepEqual(codexCredentialMounts, [
    {
      hostPath: "~/.codex/auth.json",
      sandboxPath: "/home/agent/.codex/auth.json",
      readonly: true,
    },
    {
      hostPath: "~/.codex/config.toml",
      sandboxPath: "/home/agent/.codex/config.toml",
      readonly: true,
    },
  ]);
});
