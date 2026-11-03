# CORE OS 1.2 — Planner Architecture

Flow: request validation → authority precheck → capability normalization → graph validation → deterministic topological sort → provider eligibility → cost aggregation → budget gate → plan persistence → evidence.

The planner is a pure in-memory module. It does not access the database, network, application state, or external providers. Runtime integration remains responsible for authentication, scopes, persistence, idempotency, evidence and execution controls.

This separation is intentional: graph correctness can be falsified independently from runtime side effects, while application semantics remain outside CORE OS.
