# Capability Graph Planner

`COREOS_CAPABILITY_GRAPH_PLANNER_V1` extends the existing integration contract without adding application semantics.

Legacy capabilities remain strings. A structured capability may declare:

```json
{"id":"generic.step","depends_on":["generic.input"],"cost":2,"required_interfaces":["ActionProvider"],"required_provider_capabilities":["execute"]}
```

CORE OS interprets only graph structure, numeric cost and declared provider requirements. Identifiers are opaque.

Planning fails closed on duplicate identifiers, missing dependencies, dependency cycles, invalid costs, budget excess or unresolved mandatory provider requirements. Valid DAGs receive a deterministic lexicographically stable topological order.

The emitted plan preserves `COREOS_EXECUTION_PLAN_V1` compatibility fields and adds `planner_version`, `graph`, `provider_assignments` and `unresolved_requirements`.

Provider eligibility does not grant authority. Providers exposing an external mutation surface are not eligible unless the request explicitly allows external mutation; the existing request-level `mutation:authorize` scope check remains authoritative.
