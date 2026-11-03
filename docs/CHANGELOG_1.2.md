# CORE OS 1.2 — Unreleased

## Added

- Deterministic application-opaque capability graph planner.
- Structured capability descriptors with dependencies, costs and provider requirements.
- Deterministic DAG validation and topological ordering.
- Generic provider eligibility and assignment metadata.
- Planner-specific evidence fields and unit falsification suite.

## Compatibility

Legacy string capability arrays remain accepted. `COREOS_EXECUTION_PLAN_V1` compatibility fields are retained. No database migration is introduced.

## Not yet included

Dynamic replanning, live provider health routing, multi-objective optimization, learned policy adaptation and external application pilot integration remain separate future changes.
