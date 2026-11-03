# CORE OS 1.2 — Compatibility Note

The planning extension is intended to be backward compatible with `COREOS_INTEGRATION_CONTRACT_V1`.

A legacy capability string is normalized to a graph node with no dependencies, cost `1`, and no mandatory provider requirement. Independent nodes are canonically ordered by identifier rather than preserving caller array position. This is an intentional determinism improvement; callers must not treat input position as an execution dependency. Explicit ordering requirements must be represented with `depends_on`.

Existing authority, budget, idempotency, evidence, audit, kill-switch and application-isolation contracts remain authoritative.
