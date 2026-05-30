# Coding Standards

Reviewer agents load this file during review. Treat these standards as enforceable
review criteria, not general advice.

## Think Before Coding

- Do not assume requirements. If a meaningful implementation or test cannot be
  derived from the request, existing code, docs, or tests, ask a clarifying
  question before editing.
- Surface real ambiguity, risk, and tradeoffs before coding. Do not manufacture
  tradeoffs for straightforward work.
- For non-trivial or risky work, state the success criteria before editing: the
  behavior that should change, the public interface that proves it, and the
  verification command that should pass.
- Inspect relevant local context before changing code. Match the repository's
  existing language, architecture, and test style.

## Simplicity First

- Use the minimum sufficient design for the requested outcome.
- Do not add features, extension points, configuration knobs, factories, or
  generalized helpers for imagined future needs.
- Add an abstraction only when it removes immediate duplication or hides real
  complexity introduced by the current change.
- Prefer clear necessary structure over compressed cleverness. A larger solution
  is acceptable when the problem genuinely requires it and every part earns its
  place.
- Add error handling for plausible external failures, user input, IO,
  subprocesses, network/API calls, and documented contract violations. Do not add
  branches for impossible internal states that obscure the main path.

## Surgical Changes

- Treat surgical changes as high-fidelity changes, not necessarily small changes.
  Large diffs are acceptable when the requested outcome genuinely requires them.
- Every changed line must be deliberate, locally consistent, and traceable to the
  requested goal.
- Do not perform opportunistic cleanup, unrelated formatting churn, speculative
  redesign, or broad refactors outside the requested work.
- Match the local style in the edited area, even when another style would also be
  reasonable.
- Remove imports, variables, functions, files, and comments made obsolete by your
  own change. Do not delete pre-existing dead code unless asked; mention it
  instead.
- Preserve useful comments. Add or update comments only to explain non-obvious
  intent, constraints, or tradeoffs, or when the change makes an existing comment
  inaccurate.

## Goal-Driven Execution

- Use test-driven development for behavior changes and bug fixes: write one
  failing behavior test through a public interface, make the smallest change to
  pass, then repeat.
- Do not write a whole test suite upfront. Avoid tests that verify private
  implementation details or imagined structure.
- Public interfaces include exported functions/classes, CLI behavior, generated
  template behavior, and documented npm scripts. Test private helpers only when
  they are intentionally exported as part of the module contract.
- Test names should describe observable behavior using project language.
- For pure refactors, run the relevant existing tests before and after when
  feasible. Add a new failing test only when behavior is unclear or currently
  uncovered.
- Treat generated templates under `.sandcastle/` as release-facing behavior.
  Change them only when the requested behavior requires it, and verify the
  resulting template behavior.
- Before claiming completion, run the narrowest meaningful verification command
  that proves the changed behavior. Run broader project verification when the
  touched area is shared, risky, or release-facing.
- Report the verification command and result in the final response. If
  verification was not run, say exactly what was not run and why.

## Reviewer Checklist

- Is the goal and test evidence clear?
- Are behavior changes covered through public-interface tests?
- Is the design minimum sufficient, without speculative flexibility?
- Are all changes high-fidelity and traceable to the request?
- Is the diff free of unrelated cleanup and formatting churn?
- Are generated templates changed only for requested behavior?
- Was meaningful verification run and reported?
