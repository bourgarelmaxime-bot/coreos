# Troubleshooting

`/readyz=503`: vérifier DB/migrations. `423 KILL_SWITCH_ENGAGED`: état normal fail-closed. `409 IDEMPOTENCY_CONFLICT`: même clé avec payload différent. `429`: quota applicatif atteint. Un `Z_DATA_ERROR` sur un vieux RC indique l'ancien packaging segmenté et ne doit plus être utilisé.
