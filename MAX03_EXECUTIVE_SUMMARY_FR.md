# CORE OS MAX-03 — Synthèse exécutive

CORE OS 1.2 demeure en pré-release. MAX-03 a mis au jour deux défauts majeurs de concurrence : une clé idempotente pouvait créer plusieurs requêtes et un démarrage simultané pouvait générer plusieurs exécutions. Ces deux anomalies ont été reproduites, corrigées et requalifiées sur PostgreSQL jetable. L'intégrité de la chaîne d'audit est maintenant sérialisée.

Une charge courte a réussi, notamment à 16 appels simultanés avec un p95 mesuré à 21,9 ms pour 96 requêtes ; ce chiffre ne s'extrapole pas à un service de production. Le soak continu de 30 minutes reste non conclu.

Un moteur expérimental générique exécute réellement des adaptateurs synthétiques, sélectionne les providers sous contraintes et conserve leurs observations en mémoire. Sur 12 scénarios contrôlés, le coût déclaré a été réduit de 27,8 % par rapport à first-fit à succès égal, dans un scénario artificiel ciblé. Cela ne démontre pas encore une amélioration généralisable.

**Le système n'est pas encore un produit d'orchestration adaptative complet.** La revue indépendante, les essais de panne, le rollback du nouveau code, la gestion distribuée des ressources, la persistance des observations et la preuve d'une valeur supérieure au baseline restent ouverts. Les PR #1, #2 et #3 ne sont pas fusionnées. Aucune activation en production n'est autorisée.
