# CORE OS — Spécification Adapter V1

Un adapter déclare : `adapter_id`, `version`, `interfaces`, `capabilities`, `required_permissions`, `mutation_surface`, `timeout`, `rollback_capability`, et si utile `cost`. Interfaces admises : CapabilityProvider, StateProvider, ResourceProvider, AuthorityProvider, TelemetryProvider, ActionProvider, EvidenceSink.

Les applications ne copient pas le code interne de CORE OS. Elles enregistrent un provider et exposent leurs capacités à travers cette frontière. Toute mutation externe nécessite une autorité explicite; l'absence ou la contradiction d'autorité est fail-closed.

Références livrées : `coreos.noop`, `coreos.reference-shard`, `coreos.synthetic-worker`. Le shard adapter reste une référence, jamais un concept de l'API publique.
