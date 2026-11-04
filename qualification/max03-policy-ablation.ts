// MAX-03 / exploratory controlled synthetic ablation.
// Inputs/thresholds pre-registered in MAX03_POLICY_ABLATION_SPEC.json.
// All values are modeled outcomes, not observed production performance or finance.
import {AdaptiveOrchestrator,type Provider,type Policy,type Work} from '../src/adaptive-orchestrator.ts';
const seed=193847, N=200, strategies=['first_fit','least_cost','pareto','adaptive'] as const;
const scenarios=['stable','preferred_degraded','drift','noisy_equal'] as const;
const assert=(v:any,m:string)=>{if(!v)throw Error('MAX03_ABLATION_ASSERT:'+m);};
function hash(input:string){
 let h=2166136261;
 for(let i=0;i<input.length;i++){h=Math.imul(h^input.charCodeAt(i),16777619)>>>0;}
 return h/4294967296;
}
function policy(name:typeof strategies[number]):Policy{
 return {id:'MAX03_ABLATION_'+name,strategy:name,max_replans:2,max_attempts:3,failure_circuit_threshold:2,cooldown_steps:2};
}
function providers():Provider[]{
 return [
 {id:'a-preferred',tenant_id:'ablation',capabilities:['compute'],required_scopes:['compute:invoke'],healthy:true,capacity:1,declared_cost:1,declared_latency_ms:1,mutation_surface:'NONE'},
 {id:'b-reliable',tenant_id:'ablation',capabilities:['compute'],required_scopes:['compute:invoke'],healthy:true,capacity:1,declared_cost:1.6,declared_latency_ms:2,mutation_surface:'NONE'},
 {id:'c-reserve',tenant_id:'ablation',capabilities:['compute'],required_scopes:['compute:invoke'],healthy:true,capacity:1,declared_cost:1.4,declared_latency_ms:3,mutation_surface:'NONE'}
 ];
}
function failRate(scenario:typeof scenarios[number],i:number,id:string){
 if(scenario==='stable')return .05;
 if(scenario==='preferred_degraded')return id==='a-preferred'?.7:id==='b-reliable'?.05:.2;
 if(scenario==='drift')return id==='a-preferred'?(i<100?.05:.7):id==='b-reliable'?.05:.2;
 return .25;
}
type Result={strategy:string;successes:number;modeled_cost:number;cost_per_success:number;mean_attempts:number;success_rate:number;cost_by_workload:number[];success_by_workload:number[];fallback_count:number};
async function runScenario(scenario:typeof scenarios[number],strategy:typeof strategies[number]):Promise<Result>{
 const os=new AdaptiveOrchestrator(providers()),p=policy(strategy);
 const costs:number[]=[],successes:number[]=[];let fallback=0,attempts=0;
 for(let i=0;i<N;i++){
   const w:Work={work_id:'ablation-'+scenario+'-'+i,tenant_id:'ablation',capability:'compute',
     authorized_scopes:['compute:invoke'],max_cost:4,deadline_ms:300,idempotent:true,external_mutation_authorized:false};
   const adapters:Record<string,any>={};
   for(const provider of providers())adapters[provider.id]=async()=>({
     success:hash(seed+'|'+scenario+'|'+i+'|'+provider.id)>=failRate(scenario,i,provider.id),
     failure_category:'SEEDED_SYNTHETIC_FAILURE'
   });
   const r=await os.execute(w,p,adapters,'ablation:'+scenario+':'+strategy+':'+i);
   assert(r.hard_constraints_passed,'budget');
   assert(r.external_mutations===0,'no_external_mutations');
   assert(r.spent_cost<=w.max_cost,'spend_ceiling');
   costs.push(r.spent_cost);successes.push(Number(r.success));attempts+=r.attempts.length;
   if(r.attempts.length>1)fallback++;
 }
 const sum=costs.reduce((a,x)=>a+x,0),ok=successes.reduce((a,x)=>a+x,0);
 return {strategy,successes:ok,modeled_cost:sum,cost_per_success:ok?sum/ok:Infinity,
  mean_attempts:attempts/N,success_rate:ok/N,cost_by_workload:costs,success_by_workload:successes,fallback_count:fallback};
}
function interval(a:number[],b:number[],scenario:string){
 const diffs=a.map((x,i)=>x-b[i]),average=diffs.reduce((x,y)=>x+y,0)/diffs.length;
 let state=2166136261;
 for(const c of scenario)state=Math.imul(state^c.charCodeAt(0),16777619)>>>0;
 function rnd(){state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;}
 const boot:number[]=[];
 for(let rep=0;rep<1000;rep++){let sum=0;for(let i=0;i<N;i++)sum+=diffs[Math.floor(rnd()*N)];boot.push(sum/N);}
 boot.sort((x,y)=>x-y);
 return {mean_modeled_cost_saved_per_work:average,bootstrap_95pct_CI:[boot[24],boot[974]],replications:1000};
}
async function main(){
 const results:any[]=[];
 for(const scenario of scenarios){
  const arms=await Promise.all(strategies.map(s=>runScenario(scenario,s)));
  const baseline=arms.find(x=>x.strategy==='first_fit')!;
  const adaptive=arms.find(x=>x.strategy==='adaptive')!;
  const paired=interval(baseline.cost_by_workload,adaptive.cost_by_workload,scenario);
  const eligible=adaptive.success_rate>=baseline.success_rate-.01;
  const trialVerdict=eligible&&paired.bootstrap_95pct_CI[0]>0?'SYNTHETIC_ADVANTAGE_SUPPORTED':
    paired.bootstrap_95pct_CI[1]<0?'SYNTHETIC_COST_REGRESSION':
    'SYNTHETIC_ADVANTAGE_UNPROVEN';
  results.push({scenario,arms:arms.map(({cost_by_workload,success_by_workload,...rest})=>rest),paired_baseline_vs_adaptive:paired,noninferior_success:eligible,trial_verdict:trialVerdict});
 }
 console.log(JSON.stringify({event:'MAX03_ABLATION_REPORT',verdict:'PASS_EXPERIMENT_EXECUTION',provenance:'SEEDED_SYNTHETIC_ONLY',
  seed,workloads_per_scenario:N,strategies:[...strategies],scenarios:results,
  real_world_value:'VALUE_UNPROVEN',no_policy_promotion:true}));
}
try{await main();}catch(e:any){console.error(JSON.stringify({event:'MAX03_ABLATION_REPORT',verdict:'FAIL',reason:String(e)}));process.exit(1);}
