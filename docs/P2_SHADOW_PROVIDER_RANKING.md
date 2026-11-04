# CORE OS P2 — Generic Shadow Provider Ranking (candidate)

**Boundary:** pure algorithm, isolated branch, no HTTP exposure or runtime execution.
Source: `src/shadow-provider-ranking.ts`.

CORE OS 1.2 provides a dependency-aware capability graph and eligible assignments.
This P2 candidate adds a **pure** `shadowRankProviders()` function for ranking
resource alternatives within a pre-authorized tenant/capability.

## Conservative decision sequence

1. Validate all inputs, including finite/non-negative cost, latency and confidence bands;
   reject duplicate/untrusted/malformed evidence.
2. Apply hard eligibility: same tenant, capability, scopes, healthy/capacity,
   no external mutation, declared budget/deadline limits.
3. If native baseline is ineligible, return no recommendation.
   If its quality evidence is insufficient, retain baseline.
4. Require both arms to have >= 10 independent quality observations; actual billed
   cost per success; verified p95 latency, receipt IDs and provenance claims.
5. Enforce a conservative quality non-inferiority gate:
   `candidate.ci95_low >= baseline.ci95_high - max_noninferiority_margin`,
   and the absolute required quality floor.
6. Identify cost/latency Pareto-nondominated alternatives; deterministic order:
   observed cost per success, observed p95 latency, stable provider ID.
7. Recommend the alternative only when observed cost is strictly below baseline.
   Otherwise retain the native baseline.

**Caution:** source fields such as `INDEPENDENT_EVALUATION` are declared by a
caller; they are **not proof of signature, independent quality or correct billing**.
The caller must validate evidence provenance, receipts, evaluator independence,
sample pairing, anti-leakage and source authenticity before using this function.
Until those are independently qualified, results are only **synthetic candidates**.

Hard constraints are absolute. No model content, prompt, project ID, Canon, business
action or secret is processed. The function never contacts providers, executes
external actions, promotes a policy or exposes a production endpoint.

Result invariants: `mode=SHADOW_ONLY`, `actionable=false`, `can_execute=false`,
`can_promote=false`, `economic_value_verdict=VALUE_UNPROVEN`.

**Reproducible tests:** `bun test tests/unit/shadow-provider-ranking.test.ts`.
Full existing core CI also covers PostgreSQL isolated qualification and API
compatibility, but the standalone candidate is **not integrated into the HTTP API**.

**Next gates:** independent review; validate metrics and receipts from genuinely
independent evaluators; execute task-matched randomized model comparisons under a
specifically approved spending limit; qualify the ranking on the observed data;
complete CORE OS release gates and only then consider controlled shadow routing.

## Evidence-mode separation for integration preflight

The request explicitly declares `evidence_mode`:
- `SYNTHETIC_FIXTURE`: all quality/cost/latency evidence fields must equal `SIMULATED_FIXTURE`; safe for policy-code comparisons only.
- `VERIFIED_OBSERVATIONS`: all fields must use their actual-evidence labels; the upstream operator must independently authenticate every record and its receipt. Merely claiming those labels does **not** establish independent provenance.

The CLI `qualification/p2-shadow-ranking-cli.ts` reads a single bounded JSON object on stdin, returns a deterministic, **non-actionable** decision, and does not start a server or access a model provider.

The DESIGN OS P2 harness pins the exact CORE OS source SHA and exercises both ranking-policy code paths on 80 sealed synthetic tasks; this demonstrates policy behavior and safety only, not financial value. No public API changes or production activation are implied.
