/**
 * P2 — generic, non-executing shadow ranking candidate.
 *
 * A declared provider is not trusted merely because it calls itself healthy or
 * claims observed quality. Evidence provenance must be verified upstream.
 * This module never executes an action or promotes a policy.
 */
export const SHADOW_RANKING_SCHEMA = 'COREOS_SHADOW_RANKING_V1' as const;

export type CandidateProvider = {
  id: string;
  tenant_id: string;
  capabilities: string[];
  required_scopes: string[];
  healthy: boolean;
  capacity: number;
  mutation_surface: 'NONE' | 'EXTERNAL';
  declared_cost_usd: number;
  declared_latency_ms: number;
};

export type ObservedMetrics = {
  provider_id: string;
  tenant_id: string;
  capability: string;
  quality_source: 'INDEPENDENT_EVALUATION';
  cost_source: 'ACTUAL_BILLED';
  latency_source: 'VERIFIED_OBSERVATION';
  receipt_id: string;
  sample_count: number;
  quality_mean: number;
  quality_ci95_low: number;
  quality_ci95_high: number;
  observed_cost_per_success_usd: number;
  observed_latency_p95_ms: number;
};

export type ShadowRankingRequest = {
  tenant_id: string;
  capability: string;
  baseline_provider_id: string;
  authorized_scopes: string[];
  max_cost_usd: number;
  max_latency_ms: number;
  required_quality_floor: number;
  max_noninferiority_margin: number;
  min_samples_per_provider: number;
  allow_external_mutation: false;
  providers: CandidateProvider[];
  observed: ObservedMetrics[];
};

type Reason =
  'BASELINE_UNAVAILABLE' | 'BASELINE_MISSING_VERIFIED_EVIDENCE' |
  'NO_NONINFERIOR_ELIGIBLE_ALTERNATIVE' | 'NO_MEASURED_IMPROVEMENT' |
  'CONSERVATIVE_CANDIDATE_FOUND';

export type ShadowRankingResult = {
  schema: typeof SHADOW_RANKING_SCHEMA;
  mode: 'SHADOW_ONLY';
  actionable: false;
  can_execute: false;
  can_promote: false;
  economic_value_verdict: 'VALUE_UNPROVEN';
  recommended_provider_id: string | null;
  baseline_provider_id: string;
  reason: Reason;
  eligible_provider_ids: string[];
  quality_qualified_ids: string[];
  nondominated_provider_ids: string[];
  candidate_observed_metrics: {
    provider_id: string; sample_count: number; quality_ci95_low: number;
    quality_ci95_high: number; observed_cost_per_success_usd: number;
    observed_latency_p95_ms: number;
  } | null;
};

export class ShadowRankingError extends Error {
  constructor(public readonly code: string) { super(code); }
}
const finite=(n:unknown,min=0,max=Number.POSITIVE_INFINITY):n is number=>
  typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
const safeList=(xs:unknown):xs is string[]=>
  Array.isArray(xs)&&xs.every(x=>typeof x==='string'&&x.length>0&&x.length<=128);

function validate(req:ShadowRankingRequest){
  if(!req||typeof req.tenant_id!=='string'||!req.tenant_id||
     typeof req.capability!=='string'||!req.capability||
     typeof req.baseline_provider_id!=='string'||!req.baseline_provider_id||
     !safeList(req.authorized_scopes)||!Array.isArray(req.providers)||
     !Array.isArray(req.observed)||req.allow_external_mutation!==false||
     !finite(req.max_cost_usd)||!finite(req.max_latency_ms,1)||
     !finite(req.required_quality_floor,0,1)||
     !finite(req.max_noninferiority_margin,0,0.1)||
     !Number.isInteger(req.min_samples_per_provider)||
     req.min_samples_per_provider<10||req.min_samples_per_provider>10000||
     req.providers.length>256||req.observed.length>512)
    throw new ShadowRankingError('INVALID_REQUEST');

  const ids=new Set<string>();
  for(const p of req.providers){
    if(!p||typeof p.id!=='string'||!p.id||ids.has(p.id)||
       typeof p.tenant_id!=='string'||!safeList(p.capabilities)||
       !safeList(p.required_scopes)||typeof p.healthy!=='boolean'||
       !Number.isInteger(p.capacity)||p.capacity<0||
       !['NONE','EXTERNAL'].includes(p.mutation_surface)||
       !finite(p.declared_cost_usd)||!finite(p.declared_latency_ms))
      throw new ShadowRankingError('INVALID_PROVIDER');
    ids.add(p.id);
  }
  const evidenceKeys=new Set<string>();
  for(const e of req.observed){
    if(!e||typeof e.provider_id!=='string'||!e.provider_id||
       typeof e.tenant_id!=='string'||!e.tenant_id||
       typeof e.capability!=='string'||!e.capability||
       e.quality_source!=='INDEPENDENT_EVALUATION'||
       e.cost_source!=='ACTUAL_BILLED'||
       e.latency_source!=='VERIFIED_OBSERVATION'||
       typeof e.receipt_id!=='string'||!e.receipt_id||
       !Number.isInteger(e.sample_count)||e.sample_count<0||
       !finite(e.quality_mean,0,1)||
       !finite(e.quality_ci95_low,0,1)||
       !finite(e.quality_ci95_high,0,1)||
       e.quality_ci95_low>e.quality_mean||
       e.quality_mean>e.quality_ci95_high||
       !finite(e.observed_cost_per_success_usd)||
       !finite(e.observed_latency_p95_ms))
      throw new ShadowRankingError('INVALID_EVIDENCE');
    const k=e.tenant_id+'\0'+e.capability+'\0'+e.provider_id;
    if(evidenceKeys.has(k))throw new ShadowRankingError('DUPLICATE_EVIDENCE');
    evidenceKeys.add(k);
  }
}
function qualifiedMetric(e:ObservedMetrics|undefined,minSamples:number):e is ObservedMetrics{
  return !!e&&e.sample_count>=minSamples;
}
function dominates(a:ObservedMetrics,b:ObservedMetrics){
  return a.observed_cost_per_success_usd<=b.observed_cost_per_success_usd&&
    a.observed_latency_p95_ms<=b.observed_latency_p95_ms&&
    (a.observed_cost_per_success_usd<b.observed_cost_per_success_usd||
     a.observed_latency_p95_ms<b.observed_latency_p95_ms);
}

export function shadowRankProviders(req:ShadowRankingRequest):ShadowRankingResult{
  validate(req);
  const eligible=req.providers.filter(p=>
    p.tenant_id===req.tenant_id&&p.healthy&&p.capacity>0&&
    p.capabilities.includes(req.capability)&&p.mutation_surface==='NONE'&&
    p.required_scopes.every(s=>req.authorized_scopes.includes(s))&&
    p.declared_cost_usd<=req.max_cost_usd&&
    p.declared_latency_ms<=req.max_latency_ms
  ).sort((a,b)=>cmp(a.id,b.id));
  const eligibleIds=eligible.map(x=>x.id);
  const baselineId=req.baseline_provider_id;
  const baseline=eligible.find(x=>x.id===baselineId);
  const evidence=new Map(req.observed.filter(e=>
    e.tenant_id===req.tenant_id&&e.capability===req.capability
  ).map(x=>[x.provider_id,x]));
  const result=(reason:Reason,id:string|null,qualified:string[]=[],frontier:string[]=[],chosen:ObservedMetrics|null=null):ShadowRankingResult=>({
    schema:SHADOW_RANKING_SCHEMA,mode:'SHADOW_ONLY',actionable:false,
    can_execute:false,can_promote:false,economic_value_verdict:'VALUE_UNPROVEN',
    recommended_provider_id:id,baseline_provider_id:baselineId,reason,
    eligible_provider_ids:eligibleIds,quality_qualified_ids:qualified,
    nondominated_provider_ids:frontier,candidate_observed_metrics:chosen?{
      provider_id:chosen.provider_id,sample_count:chosen.sample_count,
      quality_ci95_low:chosen.quality_ci95_low,
      quality_ci95_high:chosen.quality_ci95_high,
      observed_cost_per_success_usd:chosen.observed_cost_per_success_usd,
      observed_latency_p95_ms:chosen.observed_latency_p95_ms
    }:null
  });
  if(!baseline)return result('BASELINE_UNAVAILABLE',null);
  const base=evidence.get(baselineId);
  if(!qualifiedMetric(base,req.min_samples_per_provider))
    return result('BASELINE_MISSING_VERIFIED_EVIDENCE',baselineId);
  const qualified=eligible
    .map(p=>evidence.get(p.id))
    .filter((e):e is ObservedMetrics=>qualifiedMetric(e,req.min_samples_per_provider))
    .filter(e=>
      e.quality_ci95_low>=req.required_quality_floor&&
      // Conservative, explicitly bounded noninferiority guard;
      // uncertainty in both arms cannot be silently ignored.
      e.quality_ci95_low>=base.quality_ci95_high-req.max_noninferiority_margin&&
      e.observed_cost_per_success_usd<=req.max_cost_usd&&
      e.observed_latency_p95_ms<=req.max_latency_ms
    );
  const qualifiedIds=qualified.map(e=>e.provider_id).sort(cmp);
  const front=qualified.filter(e=>!qualified.some(other=>
    other!==e&&dominates(other,e)
  )).sort((a,b)=>
    a.observed_cost_per_success_usd-b.observed_cost_per_success_usd||
    a.observed_latency_p95_ms-b.observed_latency_p95_ms||
    cmp(a.provider_id,b.provider_id));
  const frontIds=front.map(x=>x.provider_id);
  const alternatives=front.filter(e=>e.provider_id!==baselineId);
  if(!alternatives.length)
    return result('NO_NONINFERIOR_ELIGIBLE_ALTERNATIVE',baselineId,qualifiedIds,frontIds);
  const best=alternatives[0];
  // No real improvement without a strictly lower observed cost and a
  // verified noninferiority comparison. Predicted/declared cost alone cannot win.
  if(best.observed_cost_per_success_usd>=base.observed_cost_per_success_usd)
    return result('NO_MEASURED_IMPROVEMENT',baselineId,qualifiedIds,frontIds);
  return result('CONSERVATIVE_CANDIDATE_FOUND',best.provider_id,qualifiedIds,frontIds,best);
}
