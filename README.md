# CORE OS — Adaptive Runtime

CORE OS est un runtime adaptatif application-agnostic. Il reçoit un objectif, des contraintes, une autorité explicite et des capacités disponibles, puis produit et exécute de manière bornée un plan observable et auditable.

**Candidat qualifié :** `1.1.0-rc.5`  
**Build :** `SELFCONTAINED_RC5`  
**Runtime qualifié SHA-256 :** `580124cd5b14725bc941c341a73a774ef72f0b269ff02ee07fa119a0a99cc102`  
**Baseline de recherche héritée :** `COREOS-V1.0.0 — PASS — CORE OS V1 CONSOLIDATED`

Le produit ne dépend d'aucune application externe. DESIGN OS, GMIS, CHCG et toute autre application restent hors du noyau et ne peuvent s'intégrer que par contrat/adapters.

Le runtime exact est versionné dans `src/runtime.part01.ts` → `src/runtime.part04.ts`. `python3 scripts/materialize_runtime.py` reconstruit `src/runtime.ts` à l'octet près; `python3 tests/repository_checks.py` vérifie ensuite le SHA attendu avant toute qualification.

Démarrage documentaire : `docs/QUICK_START.md`. Spécification API : `COREOS_PUBLIC_API_SPEC.yaml`.
