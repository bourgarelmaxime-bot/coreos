# Migration Guide

Les migrations sont monotones. Appliquer 001→004 dans l'ordre et conserver le kill switch engagé. La migration 004 normalise les anciens JSONB chaînes en objets.
