# Release Procedure

Build hashé → déploiement RC isolé → health/readiness → matrice live → SDK → sécurité DB → tracing → soak → rollback vers snapshot précédent → roll-forward → vérifier kill switch ON → verdict.
