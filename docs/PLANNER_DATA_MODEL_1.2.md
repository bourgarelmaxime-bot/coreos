# CORE OS 1.2 — Planner Data Model

Normalized capability node: `id`, `depends_on[]`, `cost`, `required_interfaces[]`, `required_provider_capabilities[]`.

Graph: `nodes[]`, directed `edges[]` from dependency to dependent capability, and deterministic `execution_order[]`.

Provider assignment: map from capability id to zero or more eligible provider keys. Mandatory provider requirements with zero eligible providers reject the request rather than producing a partial executable plan.

No application-specific field is interpreted by the planner.
