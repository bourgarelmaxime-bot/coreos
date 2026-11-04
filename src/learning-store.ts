import {assessGlobalSyntheticPolicy} from './policy-qualification.ts';
// MAX-03: PostgreSQL evidence-backed synthetic learning registry, scoped to a caller tenant.
// Isolated qualification only. No cross-tenant aggregation or automatic ACTIVE transition.
import type {SQL} from 'bun';
import type {Outcome,PolicyStage} from './adaptive-orchestrator.ts';
export class LearningStoreError extends Error {
 constructor(public code:string){super(code);}
}
const next:Record<PolicyStage,PolicyStage[]>={CANDIDATE:['OFFLINE_QUALIFIED'],
 OFFLINE_QUALIFIED:['SHADOW_QUALIFIED'],SHADOW_QUALIFIED:['ISOLATED_CANARY'],
 ISOLATED_CANARY:['QUALIFIED'],QUALIFIED:['ACTIVE'],ACTIVE:['RETIRED'],RETIRED:[]};
const valid=(s:string)=>typeof s==='string'&&s.length>0&&s.length<=256;
export class SyntheticLearningStore {
 constructor(private readonly db:SQL){}
 async save(tenantId:string,o:Outcome){
  if(!valid(tenantId)||o.tenant_id!==tenantId)throw new LearningStoreError('TENANT_MISMATCH');
  if(o.provenance!=='COREOS_SYNTHETIC_ADAPTER'||!valid(o.id)||!valid(o.provider_id)||!valid(o.policy_version)||
    !Number.isFinite(o.observed_cost)||o.observed_cost<0||!Number.isFinite(o.observed_latency_ms)||o.observed_latency_ms<0||
    !Number.isFinite(o.observed_at))throw new LearningStoreError('OUTCOME_INVALID');
  const result=await this.db`insert into coreos_product.orchestration_outcomes(tenant_id,outcome_id,trace_id,work_class,provider_id,policy_version,observed_success,observed_latency_ms,observed_cost,failure_category,provenance,observed_at) values(${tenantId},${o.id},${o.trace_id},${o.work_class},${o.provider_id},${o.policy_version},${o.observed_success},${o.observed_latency_ms},${o.observed_cost},${o.failure_category},${o.provenance},${new Date(o.observed_at).toISOString()}) on conflict(tenant_id,outcome_id) do nothing returning outcome_id`;
  if(result.length!==1)throw new LearningStoreError('DUPLICATE_OUTCOME');
  return {id:o.id,tenant_id:tenantId,stored:true} as const;
 }
 async history(tenantId:string,asOf:string,limit=200){
  if(!valid(tenantId)||!Number.isFinite(Date.parse(asOf))||!Number.isInteger(limit)||limit<1||limit>500)throw new LearningStoreError('QUERY_INVALID');
  const rows=await this.db`select tenant_id,outcome_id,trace_id,work_class,provider_id,policy_version,observed_success,observed_latency_ms,observed_cost,failure_category,provenance,observed_at from coreos_product.orchestration_outcomes where tenant_id=${tenantId} and observed_at<=${asOf} order by observed_at asc,outcome_id asc limit ${limit}`;
  return rows.map((r:any)=>({...r,observed_at:r.observed_at instanceof Date?r.observed_at.toISOString():String(r.observed_at)}));
 }
 async registerCandidate(tenantId:string,policyId:string,rollbackPolicyId:string|null){
  if(!valid(tenantId)||!valid(policyId))throw new LearningStoreError('POLICY_INVALID');
  const rows=await this.db`insert into coreos_product.orchestration_policy_candidates(tenant_id,policy_id,stage,rollback_policy_id) values(${tenantId},${policyId},'CANDIDATE',${rollbackPolicyId}) on conflict(tenant_id,policy_id) do nothing returning policy_id`;
  if(rows.length!==1)throw new LearningStoreError('POLICY_ALREADY_REGISTERED');
 }
 async candidate(tenantId:string,policyId:string){
  const rows=await this.db`select tenant_id,policy_id,stage,rollback_policy_id,evidence_ids from coreos_product.orchestration_policy_candidates where tenant_id=${tenantId} and policy_id=${policyId}`;
  return rows[0]||null;
 }
 async advance(tenantId:string,policyId:string,stage:PolicyStage,evidenceIds:string[],comparativeReport?:unknown){
  if(!Array.isArray(evidenceIds)||!evidenceIds.length||evidenceIds.some(x=>!valid(x)))throw new LearningStoreError('POLICY_EVIDENCE_REQUIRED');
  const old=await this.candidate(tenantId,policyId);if(!old)throw new LearningStoreError('POLICY_UNKNOWN');
  if(stage==='ACTIVE')throw new LearningStoreError('PRODUCTION_APPROVAL_REQUIRED');
  if(stage==='OFFLINE_QUALIFIED'&&!assessGlobalSyntheticPolicy(comparativeReport).eligible_for_shadow_review)
    throw new LearningStoreError('POLICY_COMPARATIVE_GATE_FAILED');
  if(stage==='SHADOW_QUALIFIED')throw new LearningStoreError('SHADOW_EVIDENCE_REQUIRED');
  if(stage==='ISOLATED_CANARY'||stage==='QUALIFIED')throw new LearningStoreError('ISOLATED_QUALIFICATION_EVIDENCE_REQUIRED');
  if(!next[old.stage as PolicyStage]?.includes(stage))throw new LearningStoreError('POLICY_TRANSITION_INVALID');
  if(stage==='ACTIVE')throw new LearningStoreError('PRODUCTION_APPROVAL_REQUIRED');
  const changed=await this.db`update coreos_product.orchestration_policy_candidates set stage=${stage},evidence_ids=${evidenceIds},updated_at=now() where tenant_id=${tenantId} and policy_id=${policyId} and stage=${old.stage} returning stage`;
  if(changed.length!==1)throw new LearningStoreError('POLICY_STATE_RACE');
  return changed[0];
 }
}
