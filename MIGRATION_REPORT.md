# CORE OS 1.2 — Migration Report

No database migration is required for this change.

Requests and execution plans are persisted as JSON payloads in the existing product schema. The richer capability descriptors and graph plan remain within those JSON documents. No table, index, constraint, destructive rewrite or irreversible state transition is introduced.

Rollback target: `main@378003ad23d7902f988edc52dee327917121c5c6`.

Rollback does not require a down migration. Any plans created by the candidate must be treated as candidate-version evidence during qualification; production deployment is not authorized by this report.
