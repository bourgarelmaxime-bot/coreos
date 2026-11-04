# MAX-04 — Audit statique et risques résiduels

## Analyse externe automatisée

GitHub CodeQL v4 `security-extended`, assemblage du runtime canonique depuis quatre fragments, sans erreur d'extraction. Source runtime SHA-256 `4f7a726d914704debe1357017aa1a70c9826eb77a844d457b8dad7e8fe5bcbe4`; résultat CodeQL : **0 finding, 0 diagnostic**, run [41781753377](https://github.com/bourgarelmaxime-bot/coreos/actions/runs/41781753377). SARIF archivé dans l'artefact `max04-codeql-sarif` (ID `13299840818`). Ce scan automatisé **n'est pas une revue humaine ou multi-agent indépendante**, et son absence de findings ne prouve pas l'absence de vulnérabilités.

## Défaillances reproduites et corrigées

- **HIGH — cancellation vs start** : sous délai SQL contrôlé, `cancel` retournait 200, mais l'état final redevenait `SUCCEEDED`. Reproduction rouge [41780580923](https://github.com/bourgarelmaxime-bot/coreos/actions/runs/41780580923), correction SQL transactionnelle et nouvelle CI verte [41780756230](https://github.com/bourgarelmaxime-bot/coreos/actions/runs/41780756230).
- **HIGH — kill switch en cours d'exécution** : la finalisation recontrôle l'autorité et le contrôle global sous verrou ; interruption sans écriture `SUCCEEDED` prouvée en CI et en hébergement. Voir [41781041386](https://github.com/bourgarelmaxime-bot/coreos/actions/runs/41781041386).
- **RESILIENCE — indisponibilité PostgreSQL** : conteneur jetable suspendu/réactivé, readiness non-200 pendant panne, reconnexion et idempotence après panne, zéro fork d'audit, kill switch engagé. [41781041386](https://github.com/bourgarelmaxime-bot/coreos/actions/runs/41781041386).

## Risques non clos

1. **HIGH — crash avec exécution RUNNING** : le runtime ne dispose pas de bail d'ownership et de réconciliation prouvée à travers des processus. Aucun exactly-once externe ne peut être affirmé ; toute reprise automatique sans lease est interdite.
2. **HIGH — fournisseur externe** : aucun véritable provider avec garanties d'idempotence, permissions attestées et mécanisme de compensation n'est qualifié.
3. **MEDIUM — contrôle global sous forte concurrence** : le verrou d'audit peut réduire le débit ; soak multi-réplicas à haute charge et panne en milieu de transaction non qualifiés.
4. **MEDIUM — auth** : jetons HMAC internes ; pas de preuve d'intégration IAM/OIDC, rotation de clés et révocation en production.
5. **PENDING — audit indépendant** : CodeQL est un outil externe de SAST, pas un deuxième ingénieur ou agent indépendant. E14 reste bloqué.

Aucun accès production, aucune réduction de permission, aucune activation d'action métier.
