export type CapabilityDescriptor = string | {
  id:string;
  depends_on?:string[];
  cost?:number;
  required_interfaces?:string[];
  required_provider_capabilities?:string[];
};

type ProviderDescriptor = {
  interface?:string;
  adapter_id?:string;
  capabilities?:string[];
  required_permissions?:string[];
  mutation_surface?:{external?:boolean};
};

type PlannerInput = {
  available_capabilities:CapabilityDescriptor[];
  providers?:ProviderDescriptor[];
  authority?:{mode?:string;allow_external_mutation?:boolean};
  budget:{max_cost:number};
};

export class PlannerError extends Error {
  code:string;
  details:any;
  constructor(code:string,details:any=null){super(code);this.code=code;this.details=details;}
}

const sortedUnique=(v:string[])=>[...new Set(v)].sort((a,b)=>a.localeCompare(b));

function normalizeCapability(raw:CapabilityDescriptor){
  if(typeof raw==='string'){
    const id=raw.trim();
    if(!id)throw new PlannerError('CAPABILITY_ID_REQUIRED');
    return {id,depends_on:[],cost:1,required_interfaces:[],required_provider_capabilities:[]};
  }
  if(!raw || typeof raw!=='object' || Array.isArray(raw))throw new PlannerError('CAPABILITY_DESCRIPTOR_INVALID');
  const id=String(raw.id||'').trim();
  if(!id)throw new PlannerError('CAPABILITY_ID_REQUIRED');
  const cost=raw.cost===undefined?1:Number(raw.cost);
  if(!Number.isFinite(cost)||cost<0)throw new PlannerError('CAPABILITY_COST_INVALID',{id});
  const arrays:[string,unknown][]=[['depends_on',raw.depends_on],['required_interfaces',raw.required_interfaces],['required_provider_capabilities',raw.required_provider_capabilities]];
  for(const [name,value] of arrays)if(value!==undefined&&(!Array.isArray(value)||value.some(x=>typeof x!=='string'||!x.trim())))throw new PlannerError('CAPABILITY_DESCRIPTOR_INVALID',{id,field:name});
  return {
    id,
    depends_on:sortedUnique((raw.depends_on||[]).map(x=>x.trim())),
    cost,
    required_interfaces:sortedUnique((raw.required_interfaces||[]).map(x=>x.trim())),
    required_provider_capabilities:sortedUnique((raw.required_provider_capabilities||[]).map(x=>x.trim()))
  };
}

export function buildCapabilityPlan(body:PlannerInput){
  const normalized=(body.available_capabilities||[]).map(normalizeCapability);
  const byId=new Map<string,ReturnType<typeof normalizeCapability>>();
  for(const node of normalized){
    if(byId.has(node.id))throw new PlannerError('DUPLICATE_CAPABILITY',{id:node.id});
    byId.set(node.id,node);
  }
  for(const node of normalized)for(const dep of node.depends_on)if(!byId.has(dep))throw new PlannerError('MISSING_CAPABILITY_DEPENDENCY',{capability:node.id,dependency:dep});

  const indegree=new Map<string,number>();
  const outgoing=new Map<string,string[]>();
  for(const node of normalized){indegree.set(node.id,node.depends_on.length);outgoing.set(node.id,[]);}
  for(const node of normalized)for(const dep of node.depends_on)outgoing.get(dep)!.push(node.id);
  for(const v of outgoing.values())v.sort((a,b)=>a.localeCompare(b));
  const ready=[...normalized.filter(n=>indegree.get(n.id)===0).map(n=>n.id)].sort((a,b)=>a.localeCompare(b));
  const order:string[]=[];
  while(ready.length){
    const id=ready.shift()!;order.push(id);
    for(const next of outgoing.get(id)||[]){
      const d=(indegree.get(next)||0)-1;indegree.set(next,d);
      if(d===0){ready.push(next);ready.sort((a,b)=>a.localeCompare(b));}
    }
  }
  if(order.length!==normalized.length)throw new PlannerError('CAPABILITY_DEPENDENCY_CYCLE',{remaining:[...indegree.entries()].filter(([,d])=>d>0).map(([id])=>id).sort()});

  const providers=(body.providers||[]).map((p,i)=>({...p,_key:p.adapter_id||`${p.interface||'provider'}:${i}`}));
  const unresolved:any[]=[];
  const assignments:Record<string,string[]>=Object.create(null);
  for(const id of order){
    const node=byId.get(id)!;
    const eligible=providers.filter(p=>{
      if(node.required_interfaces.length&&!node.required_interfaces.includes(String(p.interface||'')))return false;
      if(node.required_provider_capabilities.length){
        const caps=Array.isArray(p.capabilities)?p.capabilities:[];
        if(!node.required_provider_capabilities.every(c=>caps.includes(c)))return false;
      }
      if(p.mutation_surface?.external&&!body.authority?.allow_external_mutation)return false;
      return node.required_interfaces.length>0||node.required_provider_capabilities.length>0;
    }).map(p=>p._key).sort();
    if((node.required_interfaces.length||node.required_provider_capabilities.length)&&eligible.length===0)unresolved.push({capability:id,reason:'NO_ELIGIBLE_PROVIDER'});
    assignments[id]=eligible;
  }
  if(unresolved.length)throw new PlannerError('UNRESOLVED_PROVIDER_REQUIREMENT',{unresolved});

  const estimatedCost=order.reduce((sum,id)=>sum+byId.get(id)!.cost,0);
  const maxCost=Number(body.budget?.max_cost);
  if(!Number.isFinite(maxCost)||maxCost<0)throw new PlannerError('BUDGET_INVALID');
  if(estimatedCost>maxCost)throw new PlannerError('BUDGET_EXCEEDED',{estimated_cost:estimatedCost,max_cost:maxCost});
  const edges=normalized.flatMap(n=>n.depends_on.map(dep=>({from:dep,to:n.id}))).sort((a,b)=>a.from.localeCompare(b.from)||a.to.localeCompare(b.to));
  const nodes=order.map(id=>byId.get(id)!);
  return {
    plan_version:'COREOS_EXECUTION_PLAN_V1',
    planner_version:'COREOS_CAPABILITY_GRAPH_PLANNER_V1',
    selected_capabilities:order,
    graph:{nodes,edges,execution_order:order},
    provider_assignments:assignments,
    unresolved_requirements:[],
    authority_mode:body.authority?.mode,
    estimated_cost:estimatedCost,
    bounded:true,
    mutations_authorized:Boolean(body.authority?.allow_external_mutation),
    required_provider_interfaces:sortedUnique(providers.map(p=>String(p.interface||'')).filter(Boolean))
  };
}
