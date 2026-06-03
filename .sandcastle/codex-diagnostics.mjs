const AUTH_PATTERNS = [
  /HTTP error:\s*403 Forbidden/i,
  /wss:\/\/chatgpt\.com\/backend-api\/codex\/responses/i,
  /unauthorized/i,
  /forbidden/i,
];

const USAGE_PATTERNS = [
  /HTTP error:\s*429/i,
  /rate limit/i,
  /quota/i,
  /usage limit/i,
  /insufficient quota/i,
];

const TRANSIENT_PATTERNS = [
  /failed to refresh available models: timeout waiting for child process to exit/i,
  /timeout/i,
  /ETIMEDOUT/i,
  /ECONNRESET/i,
  /EAI_AGAIN/i,
  /HTTP error:\s*50[234]/i,
];

const toErrorText = (error, seen = new Set()) => {
  if (error == null) return "";
  if (seen.has(error)) return "";

  if (typeof error !== "object") {
    return String(error);
  }

  seen.add(error);

  const parts = [];
  if (typeof error.message === "string") parts.push(error.message);
  if (typeof error.stack === "string") parts.push(error.stack);
  if (typeof error.cause !== "undefined") parts.push(toErrorText(error.cause, seen));

  try {
    parts.push(JSON.stringify(error));
  } catch {
    // Ignore non-serializable framework error wrappers.
  }

  return parts.filter(Boolean).join("\n");
};

const matchesAny = (text, patterns) => patterns.some((pattern) => pattern.test(text));

export const classifyCodexFailure = (error) => {
  const text = toErrorText(error);

  if (matchesAny(text, AUTH_PATTERNS)) return "auth";
  if (matchesAny(text, USAGE_PATTERNS)) return "usage";
  if (matchesAny(text, TRANSIENT_PATTERNS)) return "transient";
  return "unknown";
};

export const explainCodexFailure = (phaseName, error) => {
  const kind = classifyCodexFailure(error);
  const text = toErrorText(error).trim();
  const detail = text ? `\n\nOriginal Codex error:\n${text}` : "";

  if (kind === "auth") {
    return [
      `Codex CLI authentication was rejected during ${phaseName}.`,
      "This is not a usage cap. The ChatGPT Codex websocket returned 403 Forbidden, which usually means the Codex login state is expired, invalid inside the sandbox, or no longer entitled for this endpoint.",
      "Run `codex login` on the host, then rerun `npm run sandcastle`. If the failure only happens inside Docker after relogin, rebuild the Sandcastle image with `sandcastle-init --yes`.",
    ].join("\n") + detail;
  }

  if (kind === "usage") {
    return [
      `Codex CLI usage or rate limiting stopped ${phaseName}.`,
      "This is a Codex account/plan limit response, not model-provider API key usage by Sandcastle.",
      "Wait for the limit window to reset or lower `MAX_PARALLEL_ISSUES` in `.sandcastle/.env` before rerunning.",
    ].join("\n") + detail;
  }

  if (kind === "transient") {
    return [
      `Codex CLI startup or network setup failed during ${phaseName}.`,
      "Sandcastle retried transient Codex startup failures, but the command still did not complete.",
      "Rerun `npm run sandcastle`. If this repeats, refresh the host login with `codex login` and update the Docker image with `sandcastle-init --yes`.",
    ].join("\n") + detail;
  }

  return `Codex CLI failed during ${phaseName}.${detail}`;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const runCodexPhase = async (
  phaseName,
  operation,
  { maxAttempts = 3, retryDelayMs = 3_000 } = {},
) => {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const kind = classifyCodexFailure(error);
      const canRetry = kind === "transient" && attempt < maxAttempts;

      if (!canRetry) {
        throw new Error(explainCodexFailure(phaseName, error), { cause: error });
      }

      await sleep(retryDelayMs);
    }
  }

  throw new Error(explainCodexFailure(phaseName, lastError), { cause: lastError });
};
