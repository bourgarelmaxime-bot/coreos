# CORE OS 1.2 — Rapport de qualification isolée (03/11/2026)

## Périmètre qualifié

- Runtime générique Capability Graph / constraint-aware planning. Pas d'application externe ni de mutation métier.
- Candidat de code : d6780bf612c57998eae999a6bd4ad104f5ff1948 ; base : `378003ad23d7902f988edc52dee327917121c5c6`.
- Version : `1.2.0-rc.1` / build `COREOS_1_2_RC1`.
- SHA-256 de l'artefact complet : `f9827117473e44a77967d16314d3d3b248a33e7cdf6ee1f5fbc1fd3a0db10af4`.
- SHA-256 runtime : `7b1eab455b318fdbcd27fdbfcc2902e6c3afdd4dd6a094f2d13610f5b191fe19`; planner : `d16a946b9ae018bebef8c4358d1ce994a376772344ce90312dcf38f4917ac5cc`.
- Comparaison binaire conforme entre Python 3.12 et 3.13 ainsi qu'entre CI et Railway.

## Tests et evidence

- 12 tests unitaires planner et contrôles de repository : PASS.
- 36 tests d'intégration HTTP sur PostgreSQL 17 éphémère GitHub Actions : PASS.
- 36 tests HTTP sur Railway + Neon séparés : PASS ; deployment `60352a45-289b-4cc1-9145-ca0fa5474bb3`.
- CI PR exacte : https://github.com/bourgarelmaxime-bot/coreos/actions/runs/41702781545
- Couverture : ordre topologique, DAG de 256 noeuds, cycles, dépendances absentes, doublons, coût/budget, provider permissions, tokens absents/expirés/falsifiés, scopes, séparation des applications, annulation, idempotence et conflit, redémarrage, receipts, preuves, kill switch et audit append-only.
- Toutes les mutations externes : 0 ; contrôle kill switch ON au terme des tests.

## Rollback et rollforward

- Build candidat SHA-256 `f9827117473e44a77967d16314d3d3b248a33e7cdf6ee1f5fbc1fd3a0db10af4` : `4266102a-a784-4d7c-9f1c-7f38ca3107a6` — SUCCESS.
- Build historique RC5 SHA runtime `580124cd5b14725bc941c341a73a774ef72f0b269ff02ee07fa119a0a99cc102` : `d8d94306-fe86-45d5-ac83-310cc7ada898` — SUCCESS.
- Retour vers candidat identique : `cc11860f-b53f-4692-9cbd-fad0dfb7f3bc` — SUCCESS.
- Exécution antérieure `5e308ad4-dba6-446e-8a12-62af24bb3e29` conservée SUCCEEDED avec 2 preuves et kill switch ON.
- Aucune nouvelle migration ni suppression de données ; base de test uniquement.

## Limites et verdict

- Le test DAG de 256 noeuds ne remplace pas un test proche de la limite de 1 MiB ; soak soutenu, concurrence élevée et multi-réplicas non vérifiés.
- Identité HMAC et adaptation noop uniquement, sans pilote applicatif réel ; pas de provider attestation.
- La revue indépendante E14 et les contrôles de release ne sont pas terminés.
- **Verdict limité à l'isolation / sécurité / rollback : PASS.**
- **Verdict changement : CONDITIONAL PASS — CORE OS CHANGE QUALIFIED / RELEASE BLOCKED.**
- **Merge : FAIL — CORE OS MERGE BLOCKED.**
- Aucun merge, tag, release ni déploiement applicatif de production.
