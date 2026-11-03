# CORE OS 1.2 — Capability Graph & Constraint-Aware Planning Foundation

## Engineering contract

**Classification:** MINOR / ARCHITECTURE / INTERNAL + PUBLIC PLAN EVOLUTION  
**Base:** `main@378003ad23d7902f988edc52dee327917121c5c6`  
**Base product:** `1.1.0-rc.5` / `SELFCONTAINED_RC5`  
**Target line:** `1.2.0` (provisional; release qualification remains separate)

## Problem

The qualified runtime accepts objectives, constraints, capabilities, authority, budget and providers, but `makePlan()` currently selects the first available capabilities positionally. This is deterministic but is not dependency-aware and does not establish whether a plan is executable as a graph.

## Objective

Replace positional planning with a generic deterministic capability-graph planner able to construct a bounded execution graph from application-opaque capability descriptors while enforcing dependencies, provider availability, authority and budget.

## Desired behavior

1. Accept legacy string capability identifiers without breaking the V1 integration contract.
2. Accept structured capability descriptors containing an id and optional dependency/cost/provider requirements.
3. Normalize inputs into an application-opaque capability graph.
4. Reject duplicate identifiers, missing dependencies and dependency cycles deterministically.
5. Compute a deterministic topological execution order.
6. Resolve eligible registered/request providers by declared capability/interface without interpreting domain semantics.
7. Enforce authority and budget before an executable plan is emitted.
8. Emit explicit graph nodes, edges, execution order, unresolved requirements and estimated cost.
9. Preserve fail-closed behavior: unresolved mandatory dependencies/provider requirements cannot silently become executable.
10. Preserve existing security, isolation, evidence, idempotency and kill-switch invariants.

## Non-goals

- No domain-specific semantics.
- No DESIGN OS, GMIS, CHCG or application coupling.
- No autonomous external mutation.
- No learning policy in this change.
- No stochastic planner.
- No dynamic runtime replanning or multi-objective optimization yet.
- No OIDC/federated identity work.

## Architecture boundary

The planner operates only on generic descriptors supplied through the public request/provider contracts. Capability names and metadata are opaque labels. The core may reason about graph structure, declared requirements, numerical cost and provider eligibility, but never application meaning.

## Public contract impact

Backward compatible extension is intended. Legacy `available_capabilities: string[]` remains valid. Structured descriptors are additive. Plan output evolves from a selected list to include graph metadata while retaining `selected_capabilities`, authority mode, estimated cost, bounded flag and provider-interface requirements.

## Persistence impact

No schema migration is required for the foundation: request/execution payloads are JSON and can persist the richer plan. Any later indexed graph persistence must be a separate migration.

## Security impact

Planning must not expand authority. Provider eligibility is constrained by declared interfaces/permissions and request authority. External mutation remains denied unless explicitly authorized by existing controls/scopes.

## Observability

`PLAN_CREATED` evidence must report graph node/edge counts, selected capability count, unresolved count, estimated cost and planner version without logging credentials or application secrets.

## Compatibility

Legacy requests must remain deterministic. A legacy list with no explicit dependencies becomes a graph of independent nodes and must remain plannable under existing budget rules.

## Resource-cost envelope

Planning must be bounded by request size and run in-memory. Target complexity: O(V + E + provider matching), excluding deterministic sorting. No external network call is permitted during planning.

## Risks

- Ambiguous descriptor semantics can accidentally create domain coupling.
- Cycles or missing dependencies can produce unsafe partial plans if not fail-closed.
- Provider matching can silently broaden authority if permissions are ignored.
- Compatibility can regress if legacy strings are no longer accepted.

## Acceptance criteria

- Deterministic identical plan for identical normalized input.
- Legacy compatibility demonstrated.
- DAG ordering demonstrated.
- Missing dependency rejection demonstrated.
- Cycle rejection demonstrated.
- Duplicate capability rejection demonstrated.
- Budget rejection demonstrated.
- Provider requirement rejection demonstrated when mandatory provider capability is unavailable.
- Application opacity preserved.
- Existing repository checks and deterministic build remain green.

## Falsification criteria

The change fails qualification if any test demonstrates nondeterministic ordering, silent dependency omission, cycle acceptance, budget bypass, authority expansion, cross-application leakage, domain-specific branching, or regression of the 1.1.0-rc.5 safety invariants.

## Rollback

Rollback target is the exact base commit `378003ad23d7902f988edc52dee327917121c5c6`. No irreversible migration is introduced by this change.
