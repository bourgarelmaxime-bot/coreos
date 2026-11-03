# CORE OS — Pilot Readiness

## Pilot Suitability Matrix

| Candidat | Risque intégration | Risque mutation | Réversibilité | Valeur représentative | Autorité | Verdict |
|---|---:|---:|---:|---:|---:|---|
| DESIGN OS | moyen | moyen | élevée en shadow | très élevée | en évolution / source Claude active | **DEFER** |
| GMIS | élevé | élevé (finance) | moyenne | élevée | forte sensibilité décisionnelle | **DEFER** |
| CHCG | moyen | faible | élevée | moyenne | ontologie encore en évolution | **DEFER** |
| Fixture de référence CORE OS | faible | nulle | totale | valide le contrat mais pas une vraie app | claire | déjà qualifiée P5/P6 |

La fixture interne prouve l'intégrabilité technique mais ne remplace pas un pilote applicatif indépendant. DESIGN OS serait le candidat le plus représentatif à terme, **uniquement en shadow/recommendation mode**, sans modifier l'Atlas ni la source de vérité. Son architecture continue toutefois d'évoluer activement; démarrer maintenant recréerait précisément le risque de duplication que l'intégration CORE OS cherche à éviter.

**PILOT DEFERRED — NO APPLICATION CURRENTLY MEETS PILOT ENTRY CRITERIA**

Critère de réouverture : une application choisie doit fournir un adapter boundary stable, une autorité explicite et un environnement sandbox/shadow sans mutation canonique.
