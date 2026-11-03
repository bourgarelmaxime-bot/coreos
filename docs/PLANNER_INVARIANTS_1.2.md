# CORE OS 1.2 — Planner Invariants

1. Capability identifiers are opaque to CORE OS.
2. Every dependency references a capability in the same request graph.
3. Cyclic graphs are not executable.
4. Identical normalized inputs yield identical graph order and assignments.
5. Estimated cost is the sum of normalized selected-node costs.
6. Estimated cost may not exceed request budget.
7. Mandatory provider requirements must resolve before plan acceptance.
8. Provider matching may restrict authority but never expand it.
9. Planning does not mutate external systems.
10. A valid plan does not bypass runtime kill switch or execution authority checks.
