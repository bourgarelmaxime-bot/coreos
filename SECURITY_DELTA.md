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

## Qualification empirique — 2026-11-03

Tests HTTP sur Postgres jetable (GitHub Actions, Railway) : 36/36 PASS sur le meme fichier artefact SHA-256 f9827117473e44a77967d16314d3d3b248a33e7cdf6ee1f5fbc1fd3a0db10af4. Refus verifies : authentification manquante, jeton expire, usurpation de claims, scopes insuffisants, fuite inter-app sur requetes et preuves, permission provider absente, autorite mutation absente, cout depasse, DAG invalide, kill switch ON, tentative UPDATE audit refusee par trigger.

Regressions confirmees : idempotency replay/conflict, idempotence apres restart, cancel, execution noop sans mutation externe, persistence des graphes et receipts, retour au kill switch ON.

Limites : tests non exhaustifs face aux charges soutenues, courses de concurrence, multi-replicas, mutation par adapters reels et providers non attestes. Aucun deploiement applicatif externe n'a eu lieu.
