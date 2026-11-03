# CORE OS 1.2 — Security Delta

## Scope

The change adds deterministic graph planning and provider eligibility. It does not add credentials, new mutation authority, external network calls, or persistence migrations.

## Threat delta

- **Authority expansion:** provider descriptors with an external mutation surface are excluded unless request authority explicitly allows external mutation. Existing `mutation:authorize` enforcement remains upstream in request submission.
- **Provider confusion:** required interfaces and declared provider capabilities must both match. Missing mandatory provider requirements fail closed.
- **Graph abuse:** duplicate identifiers, missing dependencies and cycles are rejected before persistence or execution.
- **Budget bypass:** normalized capability costs are summed and checked before a plan is persisted.
- **Nondeterminism:** ready queues, edges, requirements and provider assignments are canonically sorted.
- **Domain injection/coupling:** planner branches only on generic structural fields; repository checks scan known forbidden application coupling.
- **Resource exhaustion:** algorithm is bounded by request payload size and operates in memory; complexity is O(V+E) plus deterministic sorting/provider matching.

## Unchanged controls

Authentication, token verification, scopes, application isolation, idempotency, rate limiting, kill switch, persistence controls, audit chain and evidence access remain on the existing qualified path.

## Residual risks

Provider descriptors are caller-supplied planning evidence; this change does not establish provider attestation or live health verification. Runtime provider health selection and dynamic replanning remain explicitly out of scope and must not be inferred from this foundation.
