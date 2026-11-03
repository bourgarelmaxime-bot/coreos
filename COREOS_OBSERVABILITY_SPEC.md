# CORE OS — Observabilité et evidence

Chaque requête reçoit/propagera `x-correlation-id`. Les logs structurés `COREOS_HTTP_REQUEST` contiennent méthode, route, statut, app, trace et durée. Les décisions adaptatives produisent des événements evidence avec observation, décision, raison, policy_version, action/effect/cost. Un receipt final fixe request/execution/app/status/plan/result/evidence_count/trace/build.

Railway tracing est activé sur le RC final. Une trace qualifiée `73d4aec9b5a04cf0e7eec72e4cabe163` montre `POST /v1/requests` → service → `SELECT coreos_product.idempotency`; 6 spans, 0 erreur. La couverture observée contient 1 278 spans dont 518 PostgreSQL.

Métriques de qualification : 327 requêtes observées sur la fenêtre, 0 erreur 5xx; bucket le plus récent p50 6 ms / p95 27 ms / p99 27 ms. Soak applicatif RC5 : 200/200, p50 33.8 ms, p95 74.6 ms, p99 79.8 ms, max 80.6 ms.
