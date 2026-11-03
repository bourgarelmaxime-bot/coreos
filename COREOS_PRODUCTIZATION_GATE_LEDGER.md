# CORE OS — Gate Ledger de productisation

| Gate | Verdict | Preuve principale |
|---|---|---|
| P0 | **P0 PASS — PRODUCTIZATION BASELINE ESTABLISHED** | Inventaire Railway/Neon/GitHub; séparation laboratoire/produit |
| P1 | **P1 PASS — RELEASE ENGINEERING BASELINE QUALIFIED** | dépôt Git local, build autosuffisant hashé, bootstrap vierge 4 migrations/8 tables, rollback RC5→RC4→RC5 |
| P2 | **P2 PASS — PUBLIC API CONTRACT QUALIFIED** | RC5 41/41 + SDK, client sans accès DB |
| P3 | **P3 PASS — OBSERVABILITY AND EVIDENCE PLANE QUALIFIED** | trace edge→service→Postgres, receipts, evidence, logs structurés, métriques |
| P4 | **P4 PASS — SECURITY BOUNDARY QUALIFIED** | négatifs auth/tenant/scope/budget/replay/payload/rate; audit UPDATE/DELETE bloqués |
| P5 | **P5 PASS — DEVELOPER INTEGRATION SURFACE QUALIFIED** | SDK RC5 12/12, 3 adapters de référence |
| P6 | **P6 PASS — CORE OS PRODUCT RELEASE CANDIDATE QUALIFIED** | RC5 41/41, soak 200/200, restart/upgrade historique, rollback corrigé et démontré |
| P7 | **PILOT DEFERRED — NO APPLICATION CURRENTLY MEETS PILOT ENTRY CRITERIA** | DESIGN OS en évolution; GMIS mutation/finance; CHCG ontologie en évolution |

Le rollback initial vers RC2 a échoué (`Z_DATA_ERROR`) parce que l'artefact dépendait de variables mutables. RC4/RC5 ont remplacé ce packaging par des snapshots autosuffisants et le rollback a ensuite passé.
