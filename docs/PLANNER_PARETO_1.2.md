# CORE OS 1.2 — ANI / Pareto Rationale

Capability Graph is treated as the highest-centrality missing node because dependency-aware planning, provider selection, resource optimization, failover and later replanning all require an explicit executable structure. Implementing those downstream systems first would duplicate assumptions and increase coupling.

The selected change therefore implements only the smallest shared foundation: generic descriptors, DAG validation/order, structural provider eligibility, budget/authority gates and evidence. Learning, stochastic optimization and live adaptation are deferred until this node is independently falsified and qualified.
