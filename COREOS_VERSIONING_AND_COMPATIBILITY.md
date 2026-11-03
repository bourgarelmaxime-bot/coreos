# CORE OS — Versioning et compatibilité

CORE OS utilise SemVer pour le produit et versionne séparément les contrats (`COREOS_INTEGRATION_CONTRACT_V1`), policy (`COREOS_CAPACITY_POLICY_V1`) et receipts. Un changement breaking de l'API `/v1` ou du contrat V1 exige un major ou une nouvelle version de contrat. Une migration DB interne n'est pas breaking tant que l'API reste compatible.

Les RC sont immuables par artefact : l'artefact RC5 est autosuffisant et hashé. Les migrations sont monotones, numérotées et doivent être compatibles avec le rollback applicatif documenté.
