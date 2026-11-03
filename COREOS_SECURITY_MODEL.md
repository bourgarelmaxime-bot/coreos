# CORE OS — Modèle de sécurité

Le modèle sépare trois questions : **qui appelle**, **ce que ce caller peut demander**, et **ce qu'un adapter peut muter**.

L'identité RC repose sur un bearer token HMAC signé avec `app_id`, `scopes` et `exp`. Chaque lecture/écriture est bornée à `app_id`. Les opérations sont filtrées par scope; l'autorité de mutation externe nécessite `mutation:authorize`; les adapters déclarent leurs permissions et leur `mutation_surface`. Le runtime démarre fail-closed via `kill_switch=true`.

Contrôles qualifiés : credentials absents/invalides/expirés rejetés; cross-tenant 403; scopes insuffisants 403; payload >1 MiB 413; budget dépassé 422; idempotency replay conflict 409; rate limit 429; adapter non autorisé 403; audit DB append-only. Les secrets ne figurent ni dans le dépôt ni dans les artefacts.

Limite : la federation OIDC/JWT asymétrique et la rotation automatisée d'identités clientes ne font pas partie de RC5.
