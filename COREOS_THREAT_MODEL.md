# CORE OS — Threat Model

| Menace | Contrôle | Test | Résultat |
|---|---|---|---|
| Caller non authentifié / faux token / token expiré | HMAC + exp | RC5 qualifier | PASS |
| Cross-application leakage | app_id obligatoire + filtre lecture | lecture tenant B | PASS 403 |
| Replay différent sous même idempotency key | hash payload | replay conflict | PASS 409 |
| Escalade de privilège | scopes | authority/provider negatives | PASS 403 |
| Mutation adapter non autorisée | mutation_surface + scope | external adapter | PASS 403 |
| Budget runaway | max_cost | budget negative | PASS 422 |
| DoS payload | limite 1 MiB | oversized body | PASS 413 |
| DoS requêtes | rate limit/app/minute | 121 appels | PASS 429 |
| Audit tampering | triggers DB append-only | UPDATE + DELETE | PASS bloqués |
| Service failure / release regression | health/readiness + rollback | RC5→RC4→RC5 | PASS |
| Credential disclosure | variables d'environnement, pas de secrets dans logs/artifacts | inspection repo | PASS |

Risque résiduel : HMAC symétrique centralisé; absence d'OIDC/mTLS; quota distribué non partagé entre plusieurs replicas API.
