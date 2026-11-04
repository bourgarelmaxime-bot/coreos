import {test,expect} from 'bun:test';
import {AdaptiveOrchestrator,VerifiedObservations,GovernedPolicyRegistry,learningProposal,OrchestrationError,
 type Provider,type Policy,type Work} from '../../src/adaptive-orchestrator.ts';

const provider=(id:string,override:Partial<Provider>={}):Provider=>({
 id,tenant_id:'t1',capabilities:['compute'],required_scopes:['compute:invoke'],
 healthy:true,capacity:1,declared_cost:1,declared_latency_ms:2,mutation_surface:'NONE',...override});
const job=(override:Partial<Work>={}):Work=>({
 work_id:'w',tenant_id:'t1',capability:'compute',authorized_scopes:['compute:invoke'],
 max_cost:5,deadline_ms:500,idempotent:true,external_mutation_authorized:false,...override});
const policy=(strategy:Policy['strategy'],overrides:Partial<Policy>={}):Policy=>({
 id:'p',strategy,max_replans:0,max_attempts:1,failure_circuit_threshold:2,cooldown_steps:1,...overrides});
const succeed=async()=>({success:true});
const fail=async()=>({success:false,failure_category:'INJECTED_FAILURE'});

test('deterministic least-cost and lexicographic tie-breaking',async()=>{
 const os=new AdaptiveOrchestrator([provider('z'),provider('a')]);
 const r=await os.execute(job(),policy('least_cost'),{a:succeed,z:succeed},'trace1');
 expect(r.success).toBe(true);expect(r.attempts[0].provider_id).toBe('a');
});
test('tenant separation cannot cross provider ownership',async()=>{
 const os=new AdaptiveOrchestrator([provider('p',{tenant_id:'other'})]);
 const r=await os.execute(job(),policy('first_fit'),{p:succeed},'trace1');
 expect(r.success).toBe(false);expect(r.attempts).toHaveLength(0);
});
test('scopes health deadline budget and mutation surface are hard constraints',async()=>{
 const os=new AdaptiveOrchestrator([
  provider('a',{required_scopes:['admin']}),provider('b',{healthy:false}),
  provider('c',{declared_cost:9}),provider('d',{declared_latency_ms:9999}),
  provider('e',{mutation_surface:'EXTERNAL'})
 ]);
 const r=await os.execute(job(),policy('first_fit'),{a:succeed,b:succeed,c:succeed,d:succeed,e:succeed},'trace1');
 expect(r.success).toBe(false);expect(r.status).toBe('NO_ELIGIBLE_PROVIDER');
});
test('bounded failover executes real adapter call with verified observations',async()=>{
 let count=0;const os=new AdaptiveOrchestrator([provider('a'),provider('b',{declared_cost:2,declared_latency_ms:3})]);
 const r=await os.execute(job(),policy('first_fit',{max_attempts:2,max_replans:1}),{
  a:async()=>{count++;return fail();},b:async()=>{count++;return succeed();}
 },'trace-1');
 expect(count).toBe(2);expect(r.success).toBe(true);expect(r.spent_cost).toBe(3);
 expect(r.attempts.map(x=>x.provider_id)).toEqual(['a','b']);
 expect(os.history.view('t1')).toHaveLength(2);
 expect(r.external_mutations).toBe(0);
});
test('non-idempotent operations are not retried even in simulation',async()=>{
 const os=new AdaptiveOrchestrator([provider('a'),provider('b')]);let calls=0;
 const r=await os.execute(job({idempotent:false}),policy('first_fit',{max_attempts:2,max_replans:1}),{
  a:async()=>{calls++;return fail();},b:async()=>{calls++;return succeed();}
 },'trace-2');
 expect(calls).toBe(1);expect(r.success).toBe(false);
});
test('capacity is reserved during execution and released afterward',async()=>{
 let unblock!:()=>void;let entered!:()=>void;
 const busy=new Promise<void>(resolve=>unblock=resolve);
 const ready=new Promise<void>(resolve=>entered=resolve);
 const os=new AdaptiveOrchestrator([provider('a',{capacity:1})]);
 const first=os.execute(job({work_id:'first'}),policy('first_fit'),{a:async()=>{entered();await busy;return succeed();}},'trace1');
 await ready;
 const second=await os.execute(job({work_id:'second'}),policy('first_fit'),{a:succeed},'trace2');
 expect(second.success).toBe(false);expect(second.status).toBe('NO_ELIGIBLE_PROVIDER');
 unblock();expect((await first).success).toBe(true);
 expect((await os.execute(job({work_id:'third'}),policy('first_fit'),{a:succeed},'trace3')).success).toBe(true);
});
test('budget cannot be silently exceeded by failover',async()=>{
 const os=new AdaptiveOrchestrator([provider('a'),provider('b',{declared_cost:2})]);
 const r=await os.execute(job({max_cost:2}),policy('first_fit',{max_attempts:2,max_replans:1}),{a:fail,b:succeed},'tr');
 expect(r.success).toBe(false);expect(r.spent_cost).toBe(1);
});
test('declared external mutation is rejected even if adapter is supplied',async()=>{
 const os=new AdaptiveOrchestrator([provider('a',{mutation_surface:'EXTERNAL'})]);let calls=0;
 const r=await os.execute(job(),policy('first_fit'),{a:async()=>{calls++;return succeed();}},'tr');
 expect(calls).toBe(0);expect(r.status).toBe('NO_ELIGIBLE_PROVIDER');
});
test('observations are tenant-scoped and invalid provenance rejected',()=>{
 const h=new VerifiedObservations();
 expect(()=>h.record({provenance:'SELF_REPORTED'} as any)).toThrow('OBSERVATION_INVALID');
 h.record({id:'e1',tenant_id:'t1',work_class:'compute',provider_id:'a',policy_version:'p',
 observed_success:true,observed_latency_ms:2,observed_cost:1,failure_category:null,
 trace_id:'tr',provenance:'COREOS_SYNTHETIC_ADAPTER',observed_at:1,input_version:'v1'});
 expect(h.view('t1')).toHaveLength(1);expect(h.view('t2')).toHaveLength(0);
});
test('policy proposal cannot pretend observational evidence is causal',async()=>{
 const h=new VerifiedObservations();const p=[provider('a'),provider('b')];
 expect(learningProposal('t1','compute',p,h,3).verdict).toBe('VALUE_UNPROVEN');
 const os=new AdaptiveOrchestrator(p,h);
 for(let i=0;i<3;i++){
  await os.execute(job({work_id:'a'+i}),policy('fixed',{fixed_provider:'a'}),{a:fail},'a'+i);
  await os.execute(job({work_id:'b'+i}),policy('fixed',{fixed_provider:'b'}),{b:succeed},'b'+i);
 }
 const proposal=learningProposal('t1','compute',p,h,3);
 expect(proposal.verdict).toBe('CANDIDATE_ONLY');
 if('provider_id'in proposal)expect(proposal.provider_id).toBe('b');
});
test('policy version cannot become ACTIVE without production authority',()=>{
 const r=new GovernedPolicyRegistry();const p=policy('adaptive');r.register(p,'baseline');
 for(const state of ['OFFLINE_QUALIFIED','SHADOW_QUALIFIED','ISOLATED_CANARY','QUALIFIED'] as const)r.promote('p',state,['fixture-1']);
 expect(()=>r.promote('p','ACTIVE',['fixture-1'],'ISOLATED')).toThrow('PRODUCTION_APPROVAL_REQUIRED');
 expect(r.get('p')?.stage).toBe('QUALIFIED');
});
test('paired synthetic drift: adaptive reduces cost with equal success and safety',async()=>{
 const providers=[provider('a-fast',{declared_cost:1,declared_latency_ms:1}),
 provider('b-reliable',{declared_cost:2,declared_latency_ms:2})];
 const fixedOS=new AdaptiveOrchestrator(providers),adaptiveOS=new AdaptiveOrchestrator(providers);
 const a=policy('first_fit',{id:'first-fit',max_attempts:2,max_replans:1});
 const b=policy('adaptive',{id:'adaptive',max_attempts:2,max_replans:1});
 const adapters={ 'a-fast':fail,'b-reliable':succeed };
 let baseCost=0,adaptCost=0,baseOk=0,adaptOk=0;
 for(let i=0;i<12;i++){
   const fixed=await fixedOS.execute(job({work_id:'pair-'+i}),a,adapters,'b-'+i);
   const adaptive=await adaptiveOS.execute(job({work_id:'pair-'+i}),b,adapters,'a-'+i);
   baseCost+=fixed.spent_cost;adaptCost+=adaptive.spent_cost;baseOk+=Number(fixed.success);adaptOk+=Number(adaptive.success);
 }
 expect(baseOk).toBe(12);expect(adaptOk).toBe(12);
 expect(adaptCost).toBeLessThan(baseCost);
 console.log(JSON.stringify({event:'MAX03_SYNTHETIC_PAIRED_BENCHMARK',workloads:12,baseline_policy:'first_fit',candidate_policy:'adaptive',baseline_success:baseOk,adaptive_success:adaptOk,baseline_declared_cost:baseCost,adaptive_declared_cost:adaptCost,relative_cost_reduction:(baseCost-adaptCost)/baseCost,provenance:'SYNTHETIC_FAULT_SCRIPT_NOT_PRODUCTION'}));
});
