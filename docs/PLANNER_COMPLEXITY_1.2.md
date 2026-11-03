# CORE OS 1.2 — Planner Complexity Envelope

Normalization and graph construction are linear in capabilities plus dependency edges. Topological ordering uses deterministic sorted ready queues; provider matching is bounded by capabilities × request providers. Request payload size remains capped by the existing 1 MiB HTTP limit.

The planner performs no network or database calls and creates no background work. This change therefore adds bounded in-process CPU/memory cost only. Performance qualification must still measure representative large DAGs before release qualification.
