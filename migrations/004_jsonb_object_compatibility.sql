BEGIN;
UPDATE coreos_product.requests SET payload=(payload #>> '{}')::jsonb WHERE jsonb_typeof(payload)='string';
UPDATE coreos_product.executions SET payload=(payload #>> '{}')::jsonb WHERE jsonb_typeof(payload)='string';
UPDATE coreos_product.idempotency SET response=(response #>> '{}')::jsonb WHERE jsonb_typeof(response)='string';
UPDATE coreos_product.providers SET descriptor=(descriptor #>> '{}')::jsonb WHERE jsonb_typeof(descriptor)='string';
UPDATE coreos_product.evidence SET event=(event #>> '{}')::jsonb WHERE jsonb_typeof(event)='string';
INSERT INTO coreos_product.schema_migrations(version,name) VALUES(4,'jsonb_object_compatibility') ON CONFLICT(version) DO NOTHING;
COMMIT;
