BEGIN;
CREATE OR REPLACE FUNCTION coreos_product.prevent_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'COREOS_AUDIT_APPEND_ONLY'; END; $$;
CREATE TRIGGER coreos_audit_append_only_update BEFORE UPDATE ON coreos_product.audit_events FOR EACH ROW EXECUTE FUNCTION coreos_product.prevent_audit_mutation();
CREATE TRIGGER coreos_audit_append_only_delete BEFORE DELETE ON coreos_product.audit_events FOR EACH ROW EXECUTE FUNCTION coreos_product.prevent_audit_mutation();
INSERT INTO coreos_product.schema_migrations(version,name) VALUES(2,'append_only_audit') ON CONFLICT(version) DO NOTHING;
COMMIT;
