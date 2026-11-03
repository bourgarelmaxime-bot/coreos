# CORE OS 1.2 — Isolated Qualification Plan

After PR CI passes, qualify the exact PR-head artifact in reversible CORE OS-owned infrastructure with a disposable database and synthetic providers. Verify health/readiness/version, authentication/scopes, application isolation, idempotency, legacy planning, structured DAG planning, invalid graph rejection, provider requirement rejection, budget rejection, evidence/receipt integrity, kill switch, cancellation, restart persistence, rate limiting and audit behavior.

Then perform candidate → base → candidate rollback/roll-forward using a bounded persistence fixture. No external application production mutation is permitted.
