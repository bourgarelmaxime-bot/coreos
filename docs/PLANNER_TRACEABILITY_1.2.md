# CORE OS 1.2 — Planner Traceability

Requirement → implementation/evidence: legacy strings → normalizer + unit test; dependency graph → normalized nodes/edges; cycle/missing/duplicate rejection → PlannerError gates + unit tests; deterministic order → sorted Kahn traversal + determinism tests; provider eligibility → structural matcher + tests; budget → normalized cost aggregation + tests; authority → external-mutation provider exclusion plus existing request scope gate; observability → expanded PLAN_CREATED event; artifact completeness → deterministic builder embeds/verifies planner source.
