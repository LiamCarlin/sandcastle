const DEFAULT_CODEX_MODEL = "gpt-5.5";
const DEFAULT_CODEX_EFFORT = "medium";
const DEFAULT_MAX_PARALLEL_ISSUES = 2;

const allowedEfforts = new Set(["low", "medium", "high", "xhigh"]);

export const codexCredentialMounts = [
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
];

const readRequired = (env, key) => {
  const value = env[key]?.trim();
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
};

const readPositiveInteger = (env, key, defaultValue) => {
  const raw = env[key]?.trim();
  if (!raw) return defaultValue;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${key} must be a positive integer`);
  }
  return value;
};

export const getAutomationConfig = (env = process.env) => {
  if (env.OPENAI_KEY?.trim()) {
    throw new Error(
      "OPENAI_KEY is not supported; use Codex CLI login for model-backed phases",
    );
  }

  if (env.OPENAI_API_KEY?.trim()) {
    throw new Error(
      "OPENAI_API_KEY is not supported; use Codex CLI login for model-backed phases",
    );
  }

  const codexEffort = env.CODEX_EFFORT?.trim() || DEFAULT_CODEX_EFFORT;
  if (!allowedEfforts.has(codexEffort)) {
    throw new Error("CODEX_EFFORT must be one of low, medium, high, xhigh");
  }

  return {
    codexModel: env.CODEX_MODEL?.trim() || DEFAULT_CODEX_MODEL,
    codexEffort,
    maxParallelIssues: readPositiveInteger(
      env,
      "MAX_PARALLEL_ISSUES",
      DEFAULT_MAX_PARALLEL_ISSUES,
    ),
    ghToken: readRequired(env, "GH_TOKEN"),
  };
};

export const limitIssuesForRun = (issues, maxParallelIssues) =>
  [...issues]
    .sort((a, b) => Number(a.id) - Number(b.id))
    .slice(0, maxParallelIssues);
