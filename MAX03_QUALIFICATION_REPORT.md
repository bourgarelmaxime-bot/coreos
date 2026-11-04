# CORE OS MAX-03 — Qualification et état réel

## Évidence observée

- Base de référence : RC5 sur `main`, PR #1 sur 1.2, PR #2 hardening, PR #3 moteur synthétique.
- Tests de concurrence initialement rouges, puis verts sur https://github.com/bourgarelmaxime-bot/coreos/actions/runs/41769851472.
- Idempotence : 24 soumissions identiques simultanées → une requête persistée.
- Claim d'exécution : 12 démarrages simultanés → un STARTED.
- 36 tests d'intégration hérités réussis.
- Charge courte : 96 requêtes par palier, concurrence 1 / 4 / 16, sans erreur ; p95 à concurrence 16 : 21,89 ms ; p99 : 23,51 ms ; débit observé sur la courte rafale : 839 req/s. Ces chiffres ne caractérisent pas un débit soutenu ni la production.
- Graphe de 1 024 noeuds : 19,18 ms ; acceptation en-dessous de 1 Mio et refus au-dessus.
- Artefact exact de la PR #2 : `e2fa5618bdf4d1325ff4fff23f83a1e49a413044fb4366c368e107d7dd18b5d8` ; runtime : `0be6821790ea614254dd7582b6f06ce4b9fd283d36b434c37afb63e735398b18` ; planner : `d16a946b9ae018bebef8c4358d1ce994a376772344ce90312dcf38f4917ac5cc`.
- Soak 30 min : en cours / non encore qualifié, voir https://github.com/bourgarelmaxime-bot/coreos/actions/runs/41769871104.
- PR #3 : 12 scénarios de tests sur moteur de sélection synthétique, avec un exercice apparié de 12 tâches, coût déclaré 36 → 26, taux de succès constant 12/12 ; valeur hors simulation non prouvée.

## Ce qui n'est pas démontré

Audit indépendant, résilience sous panne de base, charge prolongée achevée, forte concurrence multi-réplicas, rollback de l'artefact hardené, queue équitable, intégration d'un vrai provider externe, conservation durable des résultats d'apprentissage, amélioration causale hors échantillon.

## Verdicts

- Phase A : **CONDITIONAL PASS — QUALIFIED WITH BLOCKERS**.
- Phase B : **CONDITIONAL PASS — QUALIFIED WITH BLOCKERS** (moteur synthétique isolé, pas une intégration production).
- Phase C : **CONDITIONAL PASS — QUALIFIED WITH BLOCKERS** (observations influençant l'exécution dans une mémoire locale, pas une boucle qualifiée en production).
- Valeur d'optimisation réelle : **VALUE UNPROVEN**.
- E14 / merge / release : **BLOCKED**.

Voir les registres JSON MAX03 pour les identifiants et les contrôles.

## MAX-03 hébergé / rollback du code durci

L'environnement Railway et Neon isolé a passé trois suites (36 HTTP historiques, concurrence/adversarial, charge courte) sur le code durci `a799d5b7…`. P95 à concurrence 16 : 701,54 ms pour 96 requêtes ; débit court 23,22 req/s, sans erreur, seuil préenregistré respecté. Déploiement `333b7a2b-8ad7-42b0-934f-ecbc4d16c10a` PASS.

Rollback `a799d5…` → RC5 `378003…` → `a799d5…` PASS : déploiements `333b7a2b` → `9f2d34dd` → `92497d43`. La fixture d'exécution `1f510721-0d30-43fe-8034-3ebf1ff9e6c2` est restée SUCCEEDED avec 2 preuves, kill switch actif, aucun effet externe. Voir `MAX03_ROLLBACK_RECEIPT.json`.

## Phase C : registre durable (expérimental)

Dans PR #3, migration 005, 10 résultats synthétiques persistent dans Postgres jetable. Tests d'isolation tenant, verrou append-only, lecture sans fuite de futur et promotion ACTIVE bloquée PASS. Le graphe planifié est réellement parcouru par les adaptateurs synthétiques. Pas d'exécution provider réel, pas de déploiement production, aucune preuve de gain causal généralisable.

L'audit indépendant E14 et le résultat du soak 30min restent PENDING ; pas de merge/release.

## Concurrence entre deux processus (04/11/2026)

Le test `qualification/max03-concurrency-gate.ts` lance deux instances Bun indépendantes connectées au même PostgreSQL jetable. CI `https://github.com/bourgarelmaxime-bot/coreos/actions/runs/41772019930` : 24 appels idempotents simultanés → 1 requête ; 12 démarrages simultanés → 1 succès, 11 conflits ; 1 événement `EXECUTION_STARTED`, 0 fourche d'audit. **PASS**. Ce test démontre des transactions inter-processus mais ne constitue pas une qualification d'orchestration distribuée multi-région ou de présence d'un vrai provider.

## MAX-03 — Corrections sécurité et fonctionnalité, tests rouge → vert

Le corps JSON **chunked** sans `Content-Length` dépassant 1 Mio avait été accepté (échec attesté run 41772872913). Correction par comptage incrémental des octets ; nouvelle CI PASS run 41773024017. L'ancien `adaptive_workflow` retournait HTTP 500 car `decide` n'était plus défini (run 41773467988) ; fonction restaurée depuis RC5, régression PASS run 41773536451. Ces preuves concernent le code plus récent, et invalident le raccourci consistant à transférer automatiquement les receipts d'un ancien SHA.

Les deux soaks 30 minutes sur le snapshot antérieur : 1994/1994 et 1993/1993 requêtes, zéro erreur, zéro fork de chaîne, kill switch ON (runs 41769866115, 41769871104). Un nouveau soak du code post-correction a été lancé : run 41773280716, **non conclu lors de cette rédaction**.

## Phase C — Falsification par ablation préenregistrée

Test de 4 politiques sur 200 tâches par scénario, avec appariement déterministe, seed fixe et bootstrap 95 % sur le coût modélisé par tâche. CI 41773817156 ; sources exactes : `MAX03_POLICY_ABLATION_SPEC.json` et `MAX03_POLICY_ABLATION_RESULTS.json`. Stable : first-fit 219,2 contre adaptatif 259,4 (**régression**). Provider privilégié durablement dégradé : 428 contre 331,6 (**avantage synthétique ciblé**). Drift : 311,6 contre 314,4 ; bruit égal : 286,4 contre 288 (**gain non prouvé**). La politique adaptative générale ne passe pas le gate de valeur. **Aucune promotion de politique**. Les coûts sont simulés et non des dépenses vérifiées.

## Gate C — refus de promotion désormais effectif dans le code

Le gate `assessGlobalSyntheticPolicy` évalue les quatre régimes, l'échantillon, les résultats de réussite et les intervalles bootstrap. Il refuse la politique adaptative générale (`REJECT_STATISTICAL_REGRESSION`). Les registres en mémoire et PostgreSQL ne peuvent plus passer de `CANDIDATE` à `OFFLINE_QUALIFIED` simplement avec un identifiant de preuve. Le gate de qualification intégré **PASS** en CI sur le commit `0cdba2de155e42780557d393f0e915fa533957ee` : https://github.com/bourgarelmaxime-bot/coreos/actions/runs/41774529381. Le test garde l'état `CANDIDATE` après refus et bloque toujours `ACTIVE`. Les promotions `SHADOW_QUALIFIED`, `ISOLATED_CANARY` et `QUALIFIED` restent indisponibles en l'absence de vraies preuves comparatives correspondantes. Ce n'est pas une autorisation de production.
