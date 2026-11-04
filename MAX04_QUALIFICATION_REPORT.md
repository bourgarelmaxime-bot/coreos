# CORE OS MAX-04 — Qualification actuelle au 04/11/2026

## Base et identité

- PR #5 : https://github.com/bourgarelmaxime-bot/coreos/pull/5 (draft), empilée sur PR #2.
- Code qualifié en CI : `00473c5ffadd825cf8fd6e4647702079e5849f35`.
- Image déployée sur Railway : commit `9b531dc145262f580cd34be190bc7aaac3dd67cc`. Son seul écart jusqu'au code CI est le workflow `.github/workflows/ci.yml`, aucune modification de runtime ni planner.
- Runtime SHA-256 `4f7a726d914704debe1357017aa1a70c9826eb77a844d457b8dad7e8fe5bcbe4`; artefact de lancement reproductible par `scripts/build_release.py`.

## Preuves exécutées

- CI exacte du code : [41781753377](https://github.com/bourgarelmaxime-bot/coreos/actions/runs/41781753377) : validate, integration PostgreSQL jetable, CodeQL v4, SARIF => PASS.
- Cancellation/start course contrôlée, version rouge [41780580923](https://github.com/bourgarelmaxime-bot/coreos/actions/runs/41780580923), puis verte après verrouillage transactionnel.
- Kill-switch en vol : API HTTP 423 et exécution/requête `CANCELLED` après réengagement, aucun effet externe.
- Indisponibilité PostgreSQL en CI : conteneur suspendu, readiness fail-closed, retour de connexion, idempotence préservée ; [41781041386](https://github.com/bourgarelmaxime-bot/coreos/actions/runs/41781041386).
- Hébergement isolé Railway : [a2599fd3](https://railway.app) première qualification, [db35f5d4](https://railway.app) rollback RC5, [cd7f5bb3](https://railway.app) rollforward ; états vérifiés via outils Railway/Neon. Aucun lien de déploiement public n'est prétendu.
- Repro CodeQL : runtime assemblé depuis quatre parties ; 0 finding et 0 erreur d'extraction, SARIF archivé. **Ne satisfait pas à lui seul l'audit humain indépendant**.
- Test exact de 30 min : [41782036482](https://github.com/bourgarelmaxime-bot/coreos/actions/runs/41782036482), **en cours** lors de la rédaction ; aucune conclusion anticipée.

## Verdict

**CONDITIONAL PASS — QUALIFIED WITH BLOCKERS** pour les tests isolés. **E14 / MERGE / RELEASE : BLOCKED.** Blocages : soak final sur SHA exact non conclu, audit adversarial véritablement indépendant non effectué, réconciliation d'une exécution interrompue par crash non démontrée. Aucun merge, tag ni production activation autorisé.
