import {test,expect} from 'bun:test';
import {executeSyntheticCapabilityGraph} from '../../src/synthetic-graph-integration.ts';
import type {Provider,Policy} from '../../src/adaptive-orchestrator.ts';
const prov:Provider={id:'worker',tenant_id:'t1',capabilities:['start','finish'],required_scopes:['compute:invoke'],
 healthy:true,capacity:1,declared_cost:1,declared_latency_ms:2,mutation_surface:'NONE'};
const policy:Policy={id:'synthetic-v1',strategy:'first_fit',max_attempts:1,max_replans:0,failure_circuit_threshold:2,cooldown_steps:1};
const input=()=>({tenant_id:'t1',scopes:['compute:invoke'],graph:[
 {id:'finish',depends_on:['start'],required_interfaces:['ActionProvider']},
 {id:'start',required_interfaces:['ActionProvider']}],
 providers:[prov],planner_providers:[{interface:'ActionProvider',adapter_id:'worker',
 capabilities:['start','finish'],required_permissions:['compute:invoke'],mutation_surface:{external:false as const}}],
 policy,max_cost:2,deadline_ms:250,idempotent:true,trace_id:'integration-1'});
test('full synthetic PLAN -> assignment -> real adapter -> observation -> evidence',async()=>{
 const evidence:any[]=[];const persisted:any[]=[];const calls:string[]=[];
 const result=await executeSyntheticCapabilityGraph(input(),{worker:async ctx=>{calls.push(ctx.work_id);return{success:true};}},
 async e=>{evidence.push(e);},async o=>{persisted.push(o);});
 expect(result.success).toBe(true);expect(result.execution_order).toEqual(['start','finish']);
 expect(result.executed_count).toBe(2);expect(result.spent_cost).toBe(2);
 expect(calls).toEqual(['integration-1:start','integration-1:finish']);
 expect(evidence).toHaveLength(2);expect(persisted).toHaveLength(2);
 expect(persisted.every(x=>x.provenance==='COREOS_SYNTHETIC_ADAPTER')).toBe(true);
 expect(result.external_mutations).toBe(0);
});
test('failed dependency stops downstream synthetic execution',async()=>{
 const evidence:any[]=[];let calls=0;
 const result=await executeSyntheticCapabilityGraph(input(),{worker:async()=>{calls++;return{success:false,failure_category:'INJECTED'};}},
 async e=>{evidence.push(e);});
 expect(result.success).toBe(false);expect(result.executed_count).toBe(1);
 expect(calls).toBe(1);expect(evidence).toHaveLength(1);
});
test('tenant-foreign provider cannot be invoked from graph runner',async()=>{
 let calls=0;const obj=input();obj.providers=[{...prov,tenant_id:'foreign'}];
 const result=await executeSyntheticCapabilityGraph(obj,{worker:async()=>{calls++;return{success:true};}},async()=>{});
 expect(result.success).toBe(false);expect(result.executed_count).toBe(1);expect(calls).toBe(0);
});
test('invalid capabilities and graph bounds fail closed before execution',async()=>{
 const obj=input();obj.graph=[{id:'finish',depends_on:['missing'],required_interfaces:['ActionProvider']}];
 await expect(executeSyntheticCapabilityGraph(obj,{worker:async()=>({success:true})},async()=>{})).rejects.toThrow('MISSING_CAPABILITY_DEPENDENCY');
 const obj2=input();obj2.graph=Array.from({length:65},(_,i)=>({id:String(i)}));
 await expect(executeSyntheticCapabilityGraph(obj2,{worker:async()=>({success:true})},async()=>{})).rejects.toThrow('SYNTHETIC_GRAPH_BOUNDS');
});
