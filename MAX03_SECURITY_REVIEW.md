# MAX-03 — Revue de sécurité interne (non indépendante)

## Observations confirmées

**HIGH RESOLVED (PR #2)** : 24 soumissions simultanées partageant une clé d'idempotence ont généré 24 requêtes. Test rouge puis transaction et verrou par clé : 1/24 requête unique, 24 réponses HTTP 201 avec replay. Preuve https://github.com/bourgarelmaxime-bot/coreos/actions/runs/41769851472.

**HIGH RESOLVED (PR #2)** : 12 appels simultanés du même `/start` ont généré 12 événements. Test rouge puis transition SQL compare-and-set : 1 succès et 11 conflits, 1 événement STARTED.

**MEDIUM RESOLVED (PR #2)** : changement de kill switch avec payload malformé converti en `false`. Validation booléenne explicite et test négatif ajouté.

**HIGH MITIGATED (PR #2)** : chaîne globale d'audit écrite sans section critique transactionnelle ; verrou transactionnel Postgres constant, 0 bifurcation observée pendant la charge mesurée.

## Risques ouverts

- **HIGH** — Arrêt d'exécution et annulation restent exposés à des fenêtres de course : l'action synthétique ne donne pas une garantie d'absence d'effet tardif. Aucun adapter métier externe n'est qualifié.
- **HIGH** — Le kill switch est vérifié lors de l'admission et du CAS, mais il ne constitue pas une interruption atomique de futurs effets externes.
- **MEDIUM** — Pas d'OIDC/mTLS ni de rotation/émission de jetons robustes dans le runtime HMAC historique.
- **MEDIUM** — Limiteur de débit local au processus ; absence de coordination multi-réplicas. La présence d'un Content-Length est utilisée pour le rejet précoce : les corps chunked appellent un test négatif supplémentaire.
- **MEDIUM** — Les providers enregistrés ne sont pas attestés ; attributs de coût et santé déclarés ne constituent pas une observation fiable.
- **MEDIUM** — Verrou global d'audit sécurisant la chaîne mais pouvant limiter les performances en multi-réplicas.
- **MEDIUM** — Pas de tests d'injection de panne de base ou de reprise d'une transaction en plein crash.

## Limites méthodologiques

Cette revue est menée dans le même processus d'implémentation : **elle n'est pas indépendante** et ne satisfait pas E14. Les constats sont des hypothèses de risque tant qu'aucun test ou outil indépendant n'en démontre l'exploitation.
