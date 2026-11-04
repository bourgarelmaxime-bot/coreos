import {test,expect} from 'bun:test';
import {
  shadowRankProviders,ShadowRankingError,type ShadowRankingRequest,
  type CandidateProvider,type ObservedMetrics
} from '../../src/shadow-provider-ranking.ts';

const provider=(id:string,override:Partial<CandidateProvider>={}):CandidateProvider=>({
  id,tenant_id:'tenant-a',capabilities:['inference'],required_scopes:['inference:read'],
  healthy:true,capacity:1,mutation_surface:'NONE',
  declared_cost_usd:0.20,declared_latency_ms:1000,...override
});
const metric=(id:string,override:Partial<ObservedMetrics>={}):ObservedMetrics=>({
  provider_id:id,tenant_id:'tenant-a',capability:'inference',sample_count:40,
  quality_source:'INDEPENDENT_EVALUATION',cost_source:'ACTUAL_BILLED',
  latency_source:'VERIFIED_OBSERVATION',receipt_id:'verified:'+id,
  quality_mean:0.95,quality_ci95_low:0.90,quality_ci95_high:0.98,
  observed_cost_per_success_usd:0.10,observed_latency_p95_ms:800,...override
});
const request=(override:Partial<ShadowRankingRequest>={}):ShadowRankingRequest=>({
  evidence_mode:'VERIFIED_OBSERVATIONS',
  tenant_id:'tenant-a',capability:'inference',baseline_provider_id:'base',
  authorized_scopes:['inference:read'],max_cost_usd:1,max_latency_ms:5000,
  required_quality_floor:0.75,max_noninferiority_margin:0.05,
  min_samples_per_provider:30,allow_external_mutation:false,
  providers:[provider('base'),provider('alternative')],
  observed:[metric('base'),metric('alternative',{quality_mean:0.96,quality_ci95_low:0.94,
    quality_ci95_high:0.99,observed_cost_per_success_usd:0.05,observed_latency_p95_ms:900})],
  ...override
});

test('selects a lower measured cost only after independent quality noninferiority',()=>{
 const r=shadowRankProviders(request());
 expect(r.recommended_provider_id).toBe('alternative');
 expect(r.reason).toBe('CONSERVATIVE_CANDIDATE_FOUND');
 expect(r.actionable).toBe(false);expect(r.can_promote).toBe(false);
 expect(r.can_execute).toBe(false);expect(r.economic_value_verdict).toBe('VALUE_UNPROVEN');
});
test('declared price cannot override missing actual cost evidence',()=>{
 const q=request({observed:[metric('base')],providers:[
  provider('base'),provider('alternative',{declared_cost_usd:0})
 ]});
 const r=shadowRankProviders(q);
 expect(r.recommended_provider_id).toBe('base');
 expect(r.reason).toBe('NO_NONINFERIOR_ELIGIBLE_ALTERNATIVE');
});
test('never recommends unauthorized, external-mutation, cross-tenant, unhealthy or overloaded providers',()=>{
 for(const override of [
  {tenant_id:'other'},{required_scopes:['admin']},{mutation_surface:'EXTERNAL'},
  {healthy:false},{capacity:0},{declared_cost_usd:9},{declared_latency_ms:9000},
  {capabilities:['other']}
 ]){
  const q=request({providers:[provider('base'),provider('alternative',override as any)]});
  const r=shadowRankProviders(q);
  expect(r.recommended_provider_id).toBe('base');
  expect(r.eligible_provider_ids).toEqual(['base']);
 }
});
test('no side effect authority even when candidate has dramatically cheaper cost',()=>{
 const r=shadowRankProviders(request());
 expect(r.mode).toBe('SHADOW_ONLY');
 expect(r.actionable).toBe(false);expect(r.can_execute).toBe(false);
 expect(r.can_promote).toBe(false);
});
test('quality confidence interval prevents spurious mean-only improvement',()=>{
 const q=request({observed:[
  metric('base',{quality_mean:0.90,quality_ci95_low:0.85,quality_ci95_high:0.95}),
  metric('alternative',{quality_mean:0.96,quality_ci95_low:0.70,
   quality_ci95_high:1,observed_cost_per_success_usd:0.001})
 ]});
 const r=shadowRankProviders(q);
 expect(r.recommended_provider_id).toBe('base');
});
test('insufficient independent samples cannot qualify',()=>{
 const q=request({observed:[metric('base'),metric('alternative',{
   sample_count:5,observed_cost_per_success_usd:0.001})]});
 expect(shadowRankProviders(q).recommended_provider_id).toBe('base');
});
test('unknown baseline quality prevents changing policy',()=>{
 const q=request({observed:[metric('alternative',{observed_cost_per_success_usd:0.001})]});
 const r=shadowRankProviders(q);
 expect(r.recommended_provider_id).toBe('base');
 expect(r.reason).toBe('BASELINE_MISSING_VERIFIED_EVIDENCE');
});
test('baseline excluded by permission does not select another provider',()=>{
 const q=request({providers:[provider('base',{required_scopes:['root:write']}),
   provider('alternative')]});
 const r=shadowRankProviders(q);
 expect(r.reason).toBe('BASELINE_UNAVAILABLE');
 expect(r.recommended_provider_id).toBeNull();
});
test('no measured cost improvement reverts to baseline',()=>{
 const q=request({observed:[
  metric('base',{observed_cost_per_success_usd:0.1}),
  metric('alternative',{quality_mean:0.97,quality_ci95_low:0.95,
    quality_ci95_high:0.99,observed_cost_per_success_usd:0.2})
 ]});
 const r=shadowRankProviders(q);
 expect(r.recommended_provider_id).toBe('base');
});
test('deterministic stable tie-breaking independent of provider input order',()=>{
 const extra=metric('b',{quality_mean:0.98,quality_ci95_low:0.96,quality_ci95_high:1,
   observed_cost_per_success_usd:0.05,observed_latency_p95_ms:850});
 const alt=metric('a',{quality_mean:0.98,quality_ci95_low:0.96,quality_ci95_high:1,
   observed_cost_per_success_usd:0.05,observed_latency_p95_ms:850});
 const q=request({providers:[provider('b'),provider('base'),provider('a')],
   observed:[extra,metric('base'),alt]});
 const x=shadowRankProviders(q);
 const y=shadowRankProviders({...q,providers:[...q.providers].reverse(),
   observed:[...q.observed].reverse()});
 expect(x).toEqual(y);expect(x.recommended_provider_id).toBe('a');
});
test('non-finite numbers, duplicate evidence, forged sources and unsafe authority reject',()=>{
 const cases=[
  request({allow_external_mutation:true as any}),
  request({max_cost_usd:Number.NaN}),
  request({observed:[metric('base'),metric('base')]}),
  request({observed:[metric('base'),metric('alternative',{cost_source:'ESTIMATED' as any})]}),
  request({observed:[metric('base'),metric('alternative',{quality_ci95_low:0.99})]}),
  request({providers:[provider('base'),provider('base')]}),
  request({min_samples_per_provider:0})
 ];
 for(const x of cases)expect(()=>shadowRankProviders(x)).toThrow(ShadowRankingError);
});
test('cross-tenant observations are never joined with same provider name',()=>{
 const q=request({observed:[metric('base'),metric('alternative',{
  tenant_id:'tenant-b',observed_cost_per_success_usd:0.001})]});
 const r=shadowRankProviders(q);
 expect(r.recommended_provider_id).toBe('base');
});
test('Pareto frontier identifies non-dominated quality-qualified options',()=>{
 const q=request({providers:[provider('base'),provider('alternative'),provider('slow')],
   observed:[metric('base',{observed_cost_per_success_usd:0.2,observed_latency_p95_ms:2000}),
     metric('alternative',{quality_ci95_low:0.95,quality_mean:0.97,
       quality_ci95_high:0.99,observed_cost_per_success_usd:0.05,observed_latency_p95_ms:1000}),
     metric('slow',{quality_ci95_low:0.95,quality_mean:0.97,
       quality_ci95_high:0.99,observed_cost_per_success_usd:0.08,observed_latency_p95_ms:2500})]});
 const r=shadowRankProviders(q);
 expect(r.nondominated_provider_ids).toEqual(['alternative']);
 expect(r.recommended_provider_id).toBe('alternative');
});

test('synthetic evidence cannot masquerade as real, but may exercise ranking without promotion',()=>{
 const synthetic=(m:ObservedMetrics):ObservedMetrics=>({...m,
  quality_source:'SIMULATED_FIXTURE',cost_source:'SIMULATED_FIXTURE',
  latency_source:'SIMULATED_FIXTURE'});
 const q=request({evidence_mode:'SYNTHETIC_FIXTURE',observed:[
  synthetic(metric('base')),synthetic(metric('alternative',{
   quality_mean:0.96,quality_ci95_low:0.94,quality_ci95_high:0.99,
   observed_cost_per_success_usd:0.05,observed_latency_p95_ms:900
  }))
 ]});
 const r=shadowRankProviders(q);
 expect(r.evidence_mode).toBe('SYNTHETIC_FIXTURE');
 expect(r.reason).toBe('CONSERVATIVE_CANDIDATE_FOUND');
 expect(r.actionable).toBe(false);
 expect(r.can_promote).toBe(false);
 expect(r.economic_value_verdict).toBe('VALUE_UNPROVEN');
 expect(()=>shadowRankProviders({...q,evidence_mode:'VERIFIED_OBSERVATIONS'})).toThrow(ShadowRankingError);
});
