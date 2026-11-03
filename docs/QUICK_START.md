# Quick Start

1. Configurer `DATABASE_URL` et un `COREOS_AUTH_SECRET` >=32 caractères. 2. Appliquer `migrations/001`→`004`. 3. Construire avec `python3 scripts/build_release.py`. 4. Déployer `dist/coreos-1.1.0-rc.5.ts` sur Bun 1.4.4. 5. Vérifier `/healthz`, `/readyz`, puis `/v1/version`. Le kill switch doit rester engagé tant qu'un test borné n'est pas explicitement autorisé.
