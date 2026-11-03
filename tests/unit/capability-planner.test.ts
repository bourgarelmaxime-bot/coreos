import { describe, expect, test } from 'bun:test';
import { buildCapabilityPlan, PlannerError } from '../../src/capability-planner.ts';

const base=(caps:any[],max=100,providers:any[]=[])=>({available_capabilities:caps,budget:{max_cost:max},authority:{mode:'execute',allow_external_mutation:false},providers});
const code=(fn:()=>unknown)=>{try{fn();return null;}catch(e){return (e as PlannerError).code;}};

describe('COREOS_CAPABILITY_GRAPH_PLANNER_V1',()=>{
  test('legacy strings remain valid and deterministic',()=>{
    const a=buildCapabilityPlan(base(['z','a'],2));
    const b=buildCapabilityPlan(base(['z','a'],2));
    expect(a).toEqual(b);
    expect(a.selected_capabilities).toEqual(['a','z']);
    expect(a.plan_version).toBe('COREOS_EXECUTION_PLAN_V1');
  });

  test('dependency order is topological and deterministic',()=>{
    const p=buildCapabilityPlan(base([
      {id:'publish',depends_on:['review'],cost:1},
      {id:'draft',cost:1},
      {id:'review',depends_on:['draft'],cost:1}
    ],3));
    expect(p.graph.execution_order).toEqual(['draft','review','publish']);
    expect(p.graph.edges).toEqual([{from:'draft',to:'review'},{from:'review',to:'publish'}]);
  });

  test('duplicate identifiers fail closed',()=>expect(code(()=>buildCapabilityPlan(base(['a','a'])))).toBe('DUPLICATE_CAPABILITY'));
  test('missing dependencies fail closed',()=>expect(code(()=>buildCapabilityPlan(base([{id:'a',depends_on:['missing']}])))).toBe('MISSING_CAPABILITY_DEPENDENCY'));
  test('cycles fail closed',()=>expect(code(()=>buildCapabilityPlan(base([{id:'a',depends_on:['b']},{id:'b',depends_on:['a']}])))).toBe('CAPABILITY_DEPENDENCY_CYCLE'));
  test('budget uses declared normalized costs',()=>expect(code(()=>buildCapabilityPlan(base([{id:'a',cost:2},{id:'b',cost:3}],4)))).toBe('BUDGET_EXCEEDED'));
  test('zero cost is valid and bounded',()=>expect(buildCapabilityPlan(base([{id:'a',cost:0}],0)).estimated_cost).toBe(0));

  test('provider requirements fail closed when unresolved',()=>{
    expect(code(()=>buildCapabilityPlan(base([{id:'a',required_interfaces:['ActionProvider']}],10,[])))).toBe('UNRESOLVED_PROVIDER_REQUIREMENT');
  });

  test('provider capability and interface are both enforced',()=>{
    const p=buildCapabilityPlan(base([{id:'a',required_interfaces:['ActionProvider'],required_provider_capabilities:['execute']}],10,[
      {adapter_id:'wrong',interface:'ActionProvider',capabilities:['read']},
      {adapter_id:'right',interface:'ActionProvider',capabilities:['execute']}
    ]));
    expect(p.provider_assignments.a).toEqual(['right']);
  });

  test('external mutation providers are ineligible without authority',()=>{
    expect(code(()=>buildCapabilityPlan(base([{id:'a',required_interfaces:['ActionProvider']}],10,[{adapter_id:'mutator',interface:'ActionProvider',capabilities:[],mutation_surface:{external:true}}])))).toBe('UNRESOLVED_PROVIDER_REQUIREMENT');
  });

  test('independent nodes are canonically ordered regardless of input order',()=>{
    const a=buildCapabilityPlan(base(['c','a','b'],3));
    const b=buildCapabilityPlan(base(['b','c','a'],3));
    expect(a.graph.execution_order).toEqual(b.graph.execution_order);
  });
});
