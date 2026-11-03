# CORE OS — Architecture de productisation

## Frontière produit

CORE OS est un service d'orchestration adaptative indépendant des applications. L'API ne publie aucune table interne et ne connaît aucun concept métier externe. Le chemin canonique est : **Application → contrat V1 → API → moteur générique → providers/adapters → ressources**, avec evidence/audit en retour.

## Modules

- **Public API** : surface `/v1`, lifecycle déterministe, idempotence, erreurs typées et IDs de corrélation.
- **Decision engine** : politique `COREOS_CAPACITY_POLICY_V1`, niveaux de capacité arbitraires, fail-closed.
- **Persistence** : schéma privé `coreos_product`; aucune dépendance publique au nom des tables.
- **Security** : identité applicative, scopes, autorité explicite, quotas et kill switch.
- **Evidence plane** : evidence par exécution, receipt, audit append-only, logs structurés et tracing Railway.
- **Adapter layer** : sept interfaces du contrat V1.

Les schémas historiques `coreos_v08`→`coreos_v16` restent des preuves de recherche et ne sont pas importés dans le produit.
