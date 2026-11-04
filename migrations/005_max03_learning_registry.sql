BEGIN;
CREATE TABLE IF NOT EXISTS coreos_product.orchestration_outcomes(
  tenant_id text NOT NULL,
  outcome_id text NOT NULL,
  trace_id text NOT NULL,
  work_class text NOT NULL,
  provider_id text NOT NULL,
  policy_version text NOT NULL,
  observed_success boolean NOT NULL,
  observed_latency_ms double precision NOT NULL CHECK(observed_latency_ms>=0),
  observed_cost double precision NOT NULL CHECK(observed_cost>=0),
  failure_category text,
  provenance text NOT NULL CHECK(provenance='COREOS_SYNTHETIC_ADAPTER'),
  observed_at timestamptz NOT NULL,
  persisted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,outcome_id)
);
CREATE INDEX IF NOT EXISTS coreos_outcomes_tenant_time_idx ON coreos_product.orchestration_outcomes(tenant_id,observed_at);
CREATE TABLE IF NOT EXISTS coreos_product.orchestration_policy_candidates(
 tenant_id text NOT NULL,
 policy_id text NOT NULL,
 stage text NOT NULL CHECK(stage IN ('CANDIDATE','OFFLINE_QUALIFIED','SHADOW_QUALIFIED','ISOLATED_CANARY','QUALIFIED','ACTIVE','RETIRED')),
 rollback_policy_id text,
 evidence_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,policy_id)
);
CREATE OR REPLACE FUNCTION coreos_product.prevent_outcome_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'COREOS_OUTCOME_APPEND_ONLY'; END; $$;
CREATE TRIGGER coreos_outcomes_append_only_update BEFORE UPDATE ON coreos_product.orchestration_outcomes FOR EACH ROW EXECUTE FUNCTION coreos_product.prevent_outcome_mutation();
CREATE TRIGGER coreos_outcomes_append_only_delete BEFORE DELETE ON coreos_product.orchestration_outcomes FOR EACH ROW EXECUTE FUNCTION coreos_product.prevent_outcome_mutation();
INSERT INTO coreos_product.schema_migrations(version,name) VALUES(5,'max03_synthetic_outcomes_and_policy_candidates') ON CONFLICT(version) DO NOTHING;
COMMIT;
