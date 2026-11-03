# CORE OS 1.2 — Implementation Notes

The planner was separated into `src/capability-planner.ts` so graph logic is pure and directly unit-testable. The runtime imports it and remains responsible for side effects.

The deterministic release builder now embeds both runtime and planner source, verifies each SHA-256 at artifact startup, materializes both under `/tmp`, then imports the runtime. This avoids a release artifact that passes build comparison while missing its planner dependency.

The repository integrity check no longer pins the historical 1.1.0-rc.5 runtime SHA unconditionally because an evolving candidate must necessarily change source. It supports `COREOS_EXPECTED_RUNTIME_SHA256` for exact candidate pinning once qualification freezes a candidate hash.
