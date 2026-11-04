# CORE OS MAX-03 — Synthèse exécutive

CORE OS 1.2 demeure en pré-release. MAX-03 a mis au jour deux défauts majeurs de concurrence : une clé idempotente pouvait créer plusieurs requêtes et un démarrage simultané pouvait générer plusieurs exécutions. Ces deux anomalies ont été reproduites, corrigées et requalifiées sur PostgreSQL jetable. L'intégrité de la chaîne d'audit est maintenant sérialisée.

Une charge courte a réussi, notamment à 16 appels simultanés avec un p95 mesuré à 21,9 ms pour 96 requêtes ; ce chiffre ne s'extrapole pas à un service de production. Le soak continu de 30 minutes reste non conclu.

Un moteur expérimental générique exécute réellement des adaptateurs synthétiques, sélectionne les providers sous contraintes et conserve leurs observations en mémoire. Sur 12 scénarios contrôlés, le coût déclaré a été réduit de 27,8 % par rapport à first-fit à succès égal, dans un scénario artificiel ciblé. Cela ne démontre pas encore une amélioration généralisable.

**Le système n'est pas encore un produit d'orchestration adaptative complet.** La revue indépendante, les essais de panne, le rollback du nouveau code, la gestion distribuée des ressources, la persistance des observations et la preuve d'une valeur supérieure au baseline restent ouverts. Les PR #1, #2 et #3 ne sont pas fusionnées. Aucune activation en production n'est autorisée.

## Qualification hébergée et réversibilité MAX-03

Les correctifs ont désormais passé la qualification de sécurité/concurrence et la charge courte à la fois sur CI et sur Railway/Neon isolés. Le retour arrière vers RC5 puis le retour en avant vers le candidat durci ont réussi sans perte de fixture, le kill switch restant engagé. La phase d'apprentissage dispose d'un stockage PostgreSQL append-only expérimental pour les résultats synthétiques, et son activation production est bloquée.

Le verdict de release reste cependant **bloqué** : le soak de 30 minutes n'est pas conclu et aucune revue indépendante n'a été obtenue. Les essais multi-réplicas, la sécurité d'actions externes et les gains réels restent non démontrés.

## Complément — résultats empiriques et sécurité

Deux vulnérabilités de régression ont été découvertes par falsification : dépassement de la limite d'un corps HTTP en streaming et panne du parcours adaptatif historique (`decide` manquant). Les tests ont échoué sur les versions défectueuses puis réussi après correction. Les deux soaks pré-correctifs de 30 minutes ont terminé avec 3 987 soumissions réussies et zéro rupture de chaîne d'audit ; le soak post-correctif est en cours.

L'ablation préenregistrée multi-scénarios **rejette l'activation générale** de la politique adaptative : économie modélisée seulement en dégradation persistante (428 → 331,6) et régression nette en conditions stables (219,2 → 259,4). Cela justifie un futur mécanisme d'activation sélective et une qualification comparative sur des données réelles, non une promotion automatique.
