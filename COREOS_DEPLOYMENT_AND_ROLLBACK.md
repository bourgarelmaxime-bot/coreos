# CORE OS — Déploiement et rollback

1. Exécuter les migrations versionnées dans l'ordre. 2. Construire `python3 scripts/build_release.py`. 3. Vérifier le hash. 4. Déployer le snapshot autosuffisant. 5. Attendre `/readyz=200`. 6. Lancer qualification RC. 7. Maintenir le kill switch engagé jusqu'au test borné explicite.

Rollback : redeployer le snapshot autosuffisant précédent. Le test qualifié a exécuté RC5 → RC4 puis RC4 → RC5; la fixture `d8de7a16-4a41-4ec9-ae31-db5d7606dc84` est restée lisible dans les deux sens et le kill switch est resté engagé.

Défaut historique : rollback RC2 échoué avec `Z_DATA_ERROR` car l'enveloppe dépendait de variables de segments mutables. Cette stratégie est interdite à partir de RC4.


## Bootstrap qualifié

Le bootstrap final a été rejoué sur Neon `shiny-thunder-66387824` : migrations 001→003 exécutées, les cinq transformations de données de 004 validées par `EXPLAIN` sans exécution sur la base vide, version 004 enregistrée, 8 tables, 2 triggers append-only, `kill_switch=true`, `paused=false`, 0 ligne métier. La migration 004 reste nécessaire pour les upgrades depuis les anciens bindings JSONB et a été exécutée avec succès sur l'environnement RC historique.
