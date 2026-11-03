# CORE OS 1.2 — Rollback Procedure

This change has no database migration. Before merge/release qualification, rollback means restoring the exact qualified base `378003ad23d7902f988edc52dee327917121c5c6` and rebuilding the existing 1.1.0-rc.5 artifact.

No candidate plan should be treated as production-authoritative before isolated qualification. If a later candidate is deployed to CORE OS-owned test infrastructure, rollback qualification must demonstrate candidate → base → candidate while preserving a bounded persistence fixture and fail-safe controls.
