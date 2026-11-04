// A generic, explicitly synthetic PLAN -> EXECUTION -> OBSERVATION -> EVIDENCE boundary.
// Never invoke this from a production workflow without a separately qualified adapter contract.
import {buildCapabilityPlan,type CapabilityDescriptor} from './capability-planner.ts';
import {AdaptiveOrchestrator,type Provider,type Policy,type SyntheticAdapter,type Work,type Outcome} from './adaptive-orchestrator.ts';
export type SyntheticPlanInput={
 tenant_id:string;scopes:string[];graph:CapabilityDescriptor[];providers:Provider[];
 planner_providers:Array<{interface:string;adapter_id:string;capabilities:string[];required_permissions:string[];mutation_surface:{external:false}}>;
 policy:Policy;max_cost:number;deadline_ms:number;idempotent:boolean;trace_id:string;
};
export type EvidenceSink=(event:{type:string;trace_id:string;capability:string;provider_id:string|null;success:boolean;cost:number;provenance:string})=>Promise<void>;
export async function executeSyntheticCapabilityGraph(input:SyntheticPlanInput,adapters:Record<string,SyntheticAdapter>,evidenceSink:EvidenceSink,
 persistOutcome?:(outcome:Outcome)=>Promise<void>){
 if(input.graph.length>64||input.graph.length===0)throw Error('SYNTHETIC_GRAPH_BOUNDS');
 if(!input.tenant_id||!input.trace_id||!Array.isArray(input.scopes)||typeof evidenceSink!=='function')throw Error('SYNTHETIC_CONTRACT_INVALID');
 const planner=buildCapabilityPlan({
  available_capabilities:input.graph,providers:input.planner_providers,authorized_scopes:input.scopes,
  authority:{mode:'execute',allow_external_mutation:false},budget:{max_cost:input.max_cost}
 });
 const orchestrator=new AdaptiveOrchestrator(input.providers);
 const receipts:any[]=[];let spent=0;
 for(const cap of planner.graph.execution_order){
  const remaining=input.max_cost-spent;
  if(remaining<0)throw Error('SYNTHETIC_BUDGET_VIOLATION');
  const w:Work={work_id:input.trace_id+':'+cap,tenant_id:input.tenant_id,capability:cap,authorized_scopes:input.scopes,
   max_cost:remaining,deadline_ms:input.deadline_ms,idempotent:input.idempotent,external_mutation_authorized:false};
  const oldCount=orchestrator.history.count();
  const result=await orchestrator.execute(w,input.policy,adapters,input.trace_id+':'+cap);
  spent+=result.spent_cost;
  if(spent>input.max_cost)throw Error('SYNTHETIC_BUDGET_VIOLATION');
  const newly=orchestrator.history.view(input.tenant_id).slice(oldCount);
  if(persistOutcome)for(const entry of newly)await persistOutcome(entry);
  await evidenceSink({type:'SYNTHETIC_CAPABILITY_RESULT',trace_id:input.trace_id,capability:cap,
   provider_id:result.attempts.at(-1)?.provider_id||null,success:result.success,cost:result.spent_cost,
   provenance:'COREOS_SYNTHETIC_ADAPTER'});
  receipts.push({capability:cap,success:result.success,attempts:result.attempts,status:result.status,cost:result.spent_cost});
  // A failed dependency blocks all downstream work. Never skip to execute its successors.
  if(!result.success)break;
 }
 const success=receipts.length===planner.graph.execution_order.length&&receipts.every(r=>r.success);
 return {contract:'COREOS_MAX03_SYNTHETIC_GRAPH_EXECUTION_V1',planner_version:planner.planner_version,trace_id:input.trace_id,
  tenant_id:input.tenant_id,execution_order:planner.graph.execution_order,executed_count:receipts.length,success,
  receipts,observed_count:orchestrator.history.count(),spent_cost:spent,external_mutations:0,
  learning_promotion:false,evidence_provenance:'SYNTHETIC_ONLY'};
}
