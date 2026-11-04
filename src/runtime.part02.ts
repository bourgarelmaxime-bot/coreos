async function readRequest(id:string){const r=await db`select payload from coreos_product.requests where request_id=${id}`;return r[0]?.payload||null;}
async function readExecution(id:string){const r=await db`select payload from coreos_product.executions where execution_id=${id}`;return r[0]?.payload||null;}
async function saveRequest(v:any,client:any=db){await client`insert into coreos_product.requests(request_id,execution_id,app_id,status,payload,created_at,updated_at) values(${v.request_id},${v.execution_id},${v.app_id},${v.status},${v},${v.created_at},now()) on conflict(request_id) do update set status=excluded.status,payload=excluded.payload,updated_at=now()`;}
async function saveExecution(v:any,client:any=db){await client`insert into coreos_product.executions(execution_id,request_id,app_id,status,trace_id,build,payload,created_at,updated_at) values(${v.execution_id},${v.request_id},${v.app_id},${v.status},${v.trace_id},${BUILD},${v},${v.created_at},now()) on conflict(execution_id) do update set status=excluded.status,trace_id=excluded.trace_id,build=excluded.build,payload=excluded.payload,updated_at=now()`;}

async function submit(body:any,ctx:any){
  const errors=validateRequest(body);if(errors.length)return{error:'VALIDATION_ERROR',status:400,details:errors};
  if(body.application_id&&body.application_id!==ctx.app_id)return{error:'APPLICATION_MISMATCH',status:403};
  const maxCost=Number(body.budget.max_cost);if(maxCost<0)return{error:'BUDGET_INVALID',status:400};
  if(body.authority.allow_external_mutation&&!hasScope(ctx,'mutation:authorize'))return{error:'AUTHORITY_CONTRADICTION',status:403};
  const idem=ctx.idempotency_key,payloadHash=sha256(stable(body));
  // Pure deterministic planning can be completed before acquiring any DB locks.
  let plan:any;
  try{plan=buildCapabilityPlan({...body,authorized_scopes:ctx.scopes});}
  catch(e:any){if(e instanceof PlannerError)return{error:e.code,status:e.code==='BUDGET_EXCEEDED'?422:400,details:e.details};throw e;}
  return db.begin(async (tx:any)=>{
    if(idem){
      // Two 32-bit hashes form a per-tenant/per-key transaction lock. Collisions only
      // serialize unrelated requests; they cannot authorize duplicate execution.
      await tx`select pg_advisory_xact_lock(hashtext(${ctx.app_id}),hashtext(${idem}))`;
      const priorRows=await tx`select response from coreos_product.idempotency where app_id=${ctx.app_id} and idempotency_key=${idem}`;
      if(priorRows[0]){
        const prior=priorRows[0].response;
        if(prior.payload_hash!==payloadHash)return{error:'IDEMPOTENCY_CONFLICT',status:409};
        return{...prior.response,replayed:true};
      }
    }
    const requestId=randomUUID(),executionId=randomUUID(),traceId=ctx.trace_id,created=nowIso();
    const req={request_id:requestId,execution_id:executionId,app_id:ctx.app_id,objective:body.objective,constraints:body.constraints,available_capabilities:body.available_capabilities,authority:body.authority,budget:body.budget,state_reference:body.state_reference,providers:body.providers,status:'PLANNED',created_at:created};
    const exe={execution_id:executionId,request_id:requestId,app_id:ctx.app_id,status:'PLANNED',trace_id:traceId,plan,result:null,created_at:created};
    await saveRequest(req,tx);await saveExecution(exe,tx);
    const ev=evidenceEvent({appId:ctx.app_id,requestId,executionId,traceId,type:'PLAN_CREATED',observed:{capabilities:body.available_capabilities.length,graph_nodes:plan.graph.nodes.length,graph_edges:plan.graph.edges.length,unresolved:plan.unresolved_requirements.length,planner_version:plan.planner_version},decision:'PLAN',reason:'CONSTRAINT_AWARE_GRAPH_PLAN_ACCEPTED',effect:{selected:plan.selected_capabilities.length},cost:{estimated:plan.estimated_cost}});
    await appendEvidence(executionId,ev,tx);await appendAudit(ev,tx);
    const response={request_id:requestId,execution_id:executionId,status:'PLANNED',trace_id:traceId,plan};
    if(idem)await tx`insert into coreos_product.idempotency(app_id,idempotency_key,response,created_at) values(${ctx.app_id},${idem},${{payload_hash:payloadHash,response}},now())`;
    return response;
  });
}
async function startExecution(id:string,ctx:any){
  const exe=await readExecution(id);if(!exe)return{error:'NOT_FOUND',status:404};if(exe.app_id!==ctx.app_id)return{error:'FORBIDDEN',status:403};if(exe.status!=='PLANNED')return{error:'INVALID_STATE',status:409};
  const controls=await getControls();if(controls.kill_switch)return{error:'KILL_SWITCH_ENGAGED',status:423};if(controls.paused)return{error:'RUNTIME_PAUSED',status:423};
  const req=await readRequest(exe.request_id);if(!req)return{error:'NOT_FOUND',status:404};if(req.authority.mode==='recommendation')return{error:'AUTHORITY_FORBIDS_EXECUTION',status:403};
  // A single DB compare-and-set owns this transition, including a final control check.
  // Concurrent callers must not trigger duplicate effects/evidence.
  exe.status='RUNNING';exe.started_at=nowIso();
  const claimed=await db`update coreos_product.executions set status='RUNNING',payload=${exe},updated_at=now() where execution_id=${id} and status='PLANNED' and exists (select 1 from coreos_product.controls where id=1 and kill_switch=false and paused=false) returning execution_id`;
  if(claimed.length!==1)return{error:'INVALID_STATE',status:409};
  req.status='RUNNING';await saveRequest(req);
  const started=evidenceEvent({appId:ctx.app_id,requestId:req.request_id,executionId:id,traceId:exe.trace_id,type:'EXECUTION_STARTED',observed:{kill_switch:false},decision:'EXECUTE',reason:'AUTHORIZED_BOUNDED_EXECUTION',action:{adapter:'coreos.noop'},effect:{mutated_external:false},cost:{actual:0}});await appendEvidence(id,started);await appendAudit(started);
  const wf=req.constraints?.adaptive_workflow;
  if(wf && Array.isArray(wf.levels) && Array.isArray(wf.observations)){
    let cur=wf.initial_level;const transitions:any[]=[];
