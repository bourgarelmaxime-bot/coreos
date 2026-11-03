# CORE OS 1.2 — Qualification Report

## Candidate

Branch: `feat/1.2-capability-graph-planner`  
Base: `378003ad23d7902f988edc52dee327917121c5c6`

## Implemented

- Generic structured capability descriptors with legacy string compatibility.
- Duplicate, missing-dependency and cycle rejection.
- Canonical deterministic topological ordering.
- Generic provider interface/capability eligibility.
- Authority-aware exclusion of external mutation providers.
- Declared-cost budget enforcement before persistence.
- Graph metadata and provider assignments in execution plans.
- Expanded `PLAN_CREATED` evidence.
- Deterministic artifact packaging includes the planner module.
- Unit falsification suite integrated into CI.

## Qualification state

PR CI on predecessor SHA `26ce03204eec0b459a973f4ef7d7ff357a1bf964`: PASS (GitHub Actions run 41698968028: repository checks, planner unit suite, deterministic artifact).\nSecurity correction: provider `required_permissions` must be enforced against authenticated scopes; committed new unit falsification (12th test).\nCurrent PR HEAD `bfa769850c648121541e82665ef1644a6281ebf1`: CI PENDING for exact corrected SHA.  
Isolated runtime integration: PENDING.  
Security negative qualification: PENDING beyond unit-level planner checks.  
Rollback qualification: PENDING isolated runtime test.

Current verdict: `FAIL — CORE OS CHANGE NOT QUALIFIED` until the pending evidence is demonstrated.
