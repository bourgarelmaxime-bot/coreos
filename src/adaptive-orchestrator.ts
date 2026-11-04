// CORE OS MAX-03: generic, sandbox-only adaptive orchestration.
// No application adapter, network access, credentials or external mutations.
export const ADAPTIVE_CONTRACT='COREOS_SYNTHETIC_ORCHESTRATION_V1';
export type Strategy='fixed'|'first_fit'|'least_cost'|'least_latency'|'pareto'|'adaptive';
export type Provider={
  id:string;tenant_id:string;capabilities:string[];required_scopes:string[];
  healthy:boolean;capacity:number;declared_cost:number;declared_latency_ms:number;
  mutation_surface:'NONE'|'EXTERNAL';risk_band?:number;
};
export type Work={
  work_id:string;tenant_id:string;capability:string;authorized_scopes:string[];
  max_cost:number;deadline_ms:number;idempotent:boolean;external_mutation_authorized:false;
};
export type Outcome={
  id:string;tenant_id:string;work_class:string;provider_id:string;policy_version:string;
  observed_success:boolean;observed_latency_ms:number;observed_cost:number;
  failure_category:string|null;trace_id:string;provenance:'COREOS_SYNTHETIC_ADAPTER';
  observed_at:number;input_version:string;
};
export type Policy={
  id:string;strategy:Strategy;fixed_provider?:string;max_replans:number;
  max_attempts:number;failure_circuit_threshold:number;cooldown_steps:number;
};
export type Attempt={
  index:number;provider_id:string;status:'SUCCEEDED'|'FAILED'|'TIMED_OUT';
  latency_ms:number;cost:number;reason:string;
};
export type SyntheticAdapter=(input:{work_id:string;provider_id:string;attempt:number;timeout_ms:number})=>Promise<{success:boolean;failure_category?:string}>;
export class OrchestrationError extends Error {
  constructor(public code:string){super(code);}
}
const cmp=(a:string,b:string)=>a.localeCompare(b,'en');
const finite=(x:number,min:number)=>Number.isFinite(x)&&x>=min;
export function validateWork(w:Work){
 if(!w||!w.work_id||!w.tenant_id||!w.capability||!Array.isArray(w.authorized_scopes))throw new OrchestrationError('WORK_INVALID');
 if(!finite(w.max_cost,0)||!finite(w.deadline_ms,1)||w.external_mutation_authorized!==false)throw new OrchestrationError('UNSAFE_WORK');
}
export function validateProvider(p:Provider){
 if(!p||!p.id||!p.tenant_id||!Array.isArray(p.capabilities)||!Array.isArray(p.required_scopes)||!finite(p.capacity,0)||!Number.isInteger(p.capacity)||!finite(p.declared_cost,0)||!finite(p.declared_latency_ms,0))
   throw new OrchestrationError('PROVIDER_INVALID');
 if(p.mutation_surface!=='NONE'&&p.mutation_surface!=='EXTERNAL')throw new OrchestrationError('PROVIDER_INVALID');
}
export class VerifiedObservations {
 private readonly events:Outcome[]=[];
 private counter=0;
 record(value:Outcome) {
  if(value.provenance!=='COREOS_SYNTHETIC_ADAPTER'||!finite(value.observed_latency_ms,0)||!finite(value.observed_cost,0))throw new OrchestrationError('OBSERVATION_INVALID');
  this.events.push(Object.freeze({...value}));
  this.counter++;
 }
 view(tenant:string,provider?:string):ReadonlyArray<Outcome>{
  return this.events.filter(x=>x.tenant_id===tenant&&(!provider||x.provider_id===provider)).map(x=>Object.freeze({...x}));
 }
 stats(tenant:string,provider:string){
  const r=this.events.filter(x=>x.tenant_id===tenant&&x.provider_id===provider);
  return {n:r.length,failures:r.filter(x=>!x.observed_success).length,
    success_rate:r.length?r.filter(x=>x.observed_success).length/r.length:null,
    mean_latency_ms:r.length?r.reduce((a,x)=>a+x.observed_latency_ms,0)/r.length:null,
    last_failure_count:(()=>{let n=0;for(let i=r.length-1;i>=0&&!r[i].observed_success;i--)n++;return n;})()};
 }
 count(){return this.counter;}
}
const byId=(a:Provider,b:Provider)=>cmp(a.id,b.id);
function eligible(p:Provider,w:Work,inUse:Map<string,number>,costRemaining:number,remainingMs:number){
 return p.tenant_id===w.tenant_id&&p.healthy&&p.capabilities.includes(w.capability)&&
 p.required_scopes.every(s=>w.authorized_scopes.includes(s)||w.authorized_scopes.includes('*'))&&
 p.mutation_surface==='NONE'&&p.capacity>(inUse.get(p.id)||0)&&
 p.declared_cost<=costRemaining&&p.declared_latency_ms<=remainingMs;
}
export class AdaptiveOrchestrator {
 private readonly inUse=new Map<string,number>();
 private logicalStep=0;
 constructor(public readonly providerCatalog:Provider[],public readonly history=new VerifiedObservations()){
  const ids=new Set<string>();for(const p of providerCatalog){validateProvider(p);const key=p.tenant_id+':'+p.id;if(ids.has(key))throw new OrchestrationError('DUPLICATE_PROVIDER');ids.add(key);}
 }
 private select(work:Work,policy:Policy,remainingCost:number,remainingMs:number,excluded:Set<string>):Provider|null{
  const pool=this.providerCatalog.filter(p=>!excluded.has(p.id)&&eligible(p,work,this.inUse,remainingCost,remainingMs)).sort(byId);
  if(!pool.length)return null;
  if(policy.strategy==='fixed')return pool.find(p=>p.id===policy.fixed_provider)||null;
  if(policy.strategy==='first_fit')return pool[0];
  if(policy.strategy==='least_cost')return pool.sort((a,b)=>a.declared_cost-b.declared_cost||byId(a,b))[0];
  if(policy.strategy==='least_latency')return pool.sort((a,b)=>a.declared_latency_ms-b.declared_latency_ms||byId(a,b))[0];
  if(policy.strategy==='pareto'){
    // Nondominated cost/latency/risk set; deterministic lexicographic rule, not arbitrary weights.
    const front=pool.filter(p=>!pool.some(q=>q!==p&&q.declared_cost<=p.declared_cost&&q.declared_latency_ms<=p.declared_latency_ms&&(q.risk_band||0)<=(p.risk_band||0)&&
      (q.declared_cost<p.declared_cost||q.declared_latency_ms<p.declared_latency_ms||(q.risk_band||0)<(p.risk_band||0))));
    return front.sort((a,b)=>a.declared_latency_ms-b.declared_latency_ms||a.declared_cost-b.declared_cost||byId(a,b))[0];
  }
  // Adaptive ranking only consumes runtime-observed outcomes, never provider self-reports.
  return pool.sort((a,b)=>{
    const aa=this.history.stats(work.tenant_id,a.id),bb=this.history.stats(work.tenant_id,b.id);
    // Require evidence before overriding declared latency; conservative fallback is least-latency.
    if(aa.n>=2&&bb.n>=2&&aa.success_rate!==bb.success_rate)return (bb.success_rate||0)-(aa.success_rate||0);
    if(aa.n>=2&&aa.failures===aa.n&&bb.n===0)return 1;
    if(bb.n>=2&&bb.failures===bb.n&&aa.n===0)return -1;
    return a.declared_latency_ms-b.declared_latency_ms||a.declared_cost-b.declared_cost||byId(a,b);
  })[0];
 }
 async execute(work:Work,policy:Policy,adapters:Record<string,SyntheticAdapter>,traceId:string){
  validateWork(work);
  if(!policy.id||!Number.isInteger(policy.max_attempts)||policy.max_attempts<1||policy.max_attempts>8||
     !Number.isInteger(policy.max_replans)||policy.max_replans<0||policy.max_replans>7)throw new OrchestrationError('POLICY_INVALID');
  const started=performance.now(),attempts:Attempt[]=[],excluded=new Set<string>();
  let spend=0,success=false,terminal='NO_ELIGIBLE_PROVIDER';
  for(let i=0;i<Math.min(policy.max_attempts,policy.max_replans+1);i++){
   const remaining=work.deadline_ms-(performance.now()-started);
   if(remaining<=0){terminal='DEADLINE_EXCEEDED';break;}
   const p=this.select(work,policy,work.max_cost-spend,remaining,excluded);
   if(!p){terminal='NO_ELIGIBLE_PROVIDER';break;}
   excluded.add(p.id);
   const adapter=adapters[p.id];
   // An unregistered adapter is never silently invoked or substituted.
   if(typeof adapter!=='function'){terminal='ADAPTER_UNAVAILABLE';continue;}
   this.inUse.set(p.id,(this.inUse.get(p.id)||0)+1);
   const begin=performance.now();let status:Attempt['status']='FAILED',reason='ADAPTER_FAILURE';
   try{
    const timeout=Math.max(1,Math.min(remaining,Math.max(1,p.declared_latency_ms*5)));
    const result=await Promise.race([
      adapter({work_id:work.work_id,provider_id:p.id,attempt:i,timeout_ms:timeout}),
      new Promise<never>((_,reject)=>setTimeout(()=>reject(new OrchestrationError('ADAPTER_TIMEOUT')),timeout))
    ]);
    status=result.success?'SUCCEEDED':'FAILED';reason=result.success?'OK':result.failure_category||'SYNTHETIC_FAILURE';
   }catch(e:any){status=String(e?.code||e).includes('TIMEOUT')?'TIMED_OUT':'FAILED';reason=status==='TIMED_OUT'?'ADAPTER_TIMEOUT':'ADAPTER_EXCEPTION';}
   finally{this.inUse.set(p.id,Math.max(0,(this.inUse.get(p.id)||1)-1));}
   const latency=performance.now()-begin;spend+=p.declared_cost;
   this.history.record({id:traceId+':'+i,tenant_id:work.tenant_id,work_class:work.capability,provider_id:p.id,policy_version:policy.id,
     observed_success:status==='SUCCEEDED',observed_latency_ms:latency,observed_cost:p.declared_cost,
     failure_category:status==='SUCCEEDED'?null:reason,trace_id:traceId,provenance:'COREOS_SYNTHETIC_ADAPTER',observed_at:Date.now(),input_version:ADAPTIVE_CONTRACT});
   attempts.push({index:i,provider_id:p.id,status,latency_ms:latency,cost:p.declared_cost,reason});
   if(status==='SUCCEEDED'){success=true;terminal='SUCCEEDED';break;}
   terminal=reason;
   // No retry of non-idempotent operations, even in the synthetic sandbox.
   if(!work.idempotent)break;
  }
  this.logicalStep++;
  return {contract:ADAPTIVE_CONTRACT,work_id:work.work_id,tenant_id:work.tenant_id,policy_version:policy.id,
    success,status:terminal,spent_cost:spend,attempts,elapsed_ms:performance.now()-started,
    trace_id:traceId,hard_constraints_passed:spend<=work.max_cost,external_mutations:0,
    observations_source:'COREOS_SYNTHETIC_ADAPTER'} as const;
 }
}
export type PolicyStage='CANDIDATE'|'OFFLINE_QUALIFIED'|'SHADOW_QUALIFIED'|'ISOLATED_CANARY'|'QUALIFIED'|'ACTIVE'|'RETIRED';
const transitions:Record<PolicyStage,PolicyStage[]>={CANDIDATE:['OFFLINE_QUALIFIED'],OFFLINE_QUALIFIED:['SHADOW_QUALIFIED'],
 SHADOW_QUALIFIED:['ISOLATED_CANARY'],ISOLATED_CANARY:['QUALIFIED'],QUALIFIED:['ACTIVE'],ACTIVE:['RETIRED'],RETIRED:[]};
export class GovernedPolicyRegistry {
 private policies=new Map<string,{policy:Policy,stage:PolicyStage,evidence_ids:string[],rollback_id:string|null}>();
 register(policy:Policy,rollback_id:string|null){if(this.policies.has(policy.id))throw new OrchestrationError('POLICY_ALREADY_REGISTERED');
  this.policies.set(policy.id,{policy:{...policy},stage:'CANDIDATE',evidence_ids:[],rollback_id});}
 get(id:string){const p=this.policies.get(id);return p?{...p,policy:{...p.policy},evidence_ids:[...p.evidence_ids]}:null;}
 promote(id:string,next:PolicyStage,evidence:string[],authority:'ISOLATED'|'PRODUCTION'='ISOLATED'){
  const current=this.policies.get(id);if(!current)throw new OrchestrationError('POLICY_UNKNOWN');
  if(!transitions[current.stage].includes(next))throw new OrchestrationError('POLICY_TRANSITION_INVALID');
  if(!evidence.length||evidence.some(e=>!e))throw new OrchestrationError('POLICY_EVIDENCE_REQUIRED');
  if(next==='ACTIVE'&&authority!=='PRODUCTION')throw new OrchestrationError('PRODUCTION_APPROVAL_REQUIRED');
  current.stage=next;current.evidence_ids=[...evidence];
 }
}
export function learningProposal(tenant:string,capability:string,providers:Provider[],history:VerifiedObservations,minSamples=3){
 const samples=providers.filter(p=>p.tenant_id===tenant&&p.capabilities.includes(capability)).map(p=>({p,s:history.stats(tenant,p.id)}));
 const qualified=samples.filter(x=>x.s.n>=minSamples);
 if(qualified.length<2)return{verdict:'VALUE_UNPROVEN',reason:'INSUFFICIENT_COMPARABLE_OBSERVATIONS',sample_count:qualified.reduce((n,x)=>n+x.s.n,0)};
 const sorted=qualified.sort((a,b)=>(b.s.success_rate||0)-(a.s.success_rate||0)||a.p.declared_cost-b.p.declared_cost||byId(a.p,b.p));
 const best=sorted[0];
 return{verdict:'CANDIDATE_ONLY',provider_id:best.p.id,sample_count:qualified.reduce((n,x)=>n+x.s.n,0),
  observed_success_rate:best.s.success_rate,reason:'OBSERVATIONAL_RANKING_NOT_CAUSAL'};
}
