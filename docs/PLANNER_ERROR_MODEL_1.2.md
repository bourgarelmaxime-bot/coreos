# CORE OS 1.2 — Planner Error Model

Planner failures are deterministic pre-persistence request failures. Graph/descriptor/provider resolution errors return HTTP 400 through the existing runtime error envelope. Budget excess returns HTTP 422. Existing request validation, application mismatch and authority contradiction statuses remain unchanged.

Planner errors carry bounded structural details where useful, such as the missing dependency, duplicate id, remaining cycle nodes or unresolved provider requirements. They must not include credentials or secrets.
