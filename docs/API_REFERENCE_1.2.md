# API Reference Addendum — CORE OS 1.2 Planning

`POST /v1/requests` keeps the V1 request envelope. `available_capabilities` may contain legacy strings or structured descriptors.

Structured descriptor fields: `id` required string; `depends_on` optional string array; `cost` optional non-negative number defaulting to 1; `required_interfaces` optional provider-interface array; `required_provider_capabilities` optional opaque string array.

Planning errors are returned before request/execution persistence: `DUPLICATE_CAPABILITY`, `MISSING_CAPABILITY_DEPENDENCY`, `CAPABILITY_DEPENDENCY_CYCLE`, `CAPABILITY_COST_INVALID`, `UNRESOLVED_PROVIDER_REQUIREMENT`, `BUDGET_EXCEEDED`.

The returned `plan` retains existing fields and adds `planner_version`, `graph.nodes`, `graph.edges`, `graph.execution_order`, `provider_assignments`, and `unresolved_requirements`.
