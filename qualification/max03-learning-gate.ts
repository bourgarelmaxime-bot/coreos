import {SQL} from 'bun';
import {AdaptiveOrchestrator,type Provider,type Work,type Policy} from '../src/adaptive-orchestrator.ts';
import {SyntheticLearningStore} from '../src/learning-store.ts';
const db=new SQL(Bun.env.DATABASE_URL||'');
function check(x:any,name:string){if(!x)throw Error('MAX03_LEARNING_ASSERT:'+name);}
function splitSql(src:string){
 const out:string[]=[];let cur='',single=false,dollar=false;
 for(let i=0;i<src.length;i++){const c=src[i];
  if(!single&&src.slice(i,i+2)==='$$'){dollar=!dollar;cur+='$$';i++;continue;}
  if(!dollar&&c==="'"){if(single&&src[i+1]==="'"){cur+="''";i++;continue;}single=!single;}
  if(c===';'&&!single&&!dollar){const t=cur.trim();if(t&&t!=='BEGIN'&&t!=='COMMIT')out.push(t);cur='';}else cur+=c;
 }return out;
}
const providers:Provider[]=[{id:'alpha',tenant_id:'t1',capabilities:['compute'],required_scopes:['compute:invoke'],
  healthy:true,capacity:1,declared_cost:1,declared_latency_ms:1,mutation_surface:'NONE'},
 {id:'beta',tenant_id:'t1',capabilities:['compute'],required_scopes:['compute:invoke'],
  healthy:true,capacity:1,declared_cost:2,declared_latency_ms:2,mutation_surface:'NONE'}];
const w:Work={work_id:'learning-test',tenant_id:'t1',capability:'compute',authorized_scopes:['compute:invoke'],
  max_cost:4,deadline_ms:500,idempotent:true,external_mutation_authorized:false};
const p:Policy={id:'max03-learning-v0',strategy:'adaptive',max_attempts:2,max_replans:1,
 failure_circuit_threshold:2,cooldown_steps:1};
async function main(){
 check(Boolean(Bun.env.DATABASE_URL),'DB_REQUIRED');
 const migration=await Bun.file('migrations/005_max03_learning_registry.sql').text();
 for(const stmt of splitSql(migration))await db.unsafe(stmt);
 const store=new SyntheticLearningStore(db);
 const engine=new AdaptiveOrchestrator(providers);
 let persisted=0;
 const cutoff=new Date().toISOString();await Bun.sleep(10);
 for(let i=0;i<8;i++){
  const out=await engine.execute({...w,work_id:'learning-'+i},p,
    {alpha:async()=>({success:false,failure_category:'INJECTED_DEGRADATION'}),beta:async()=>({success:true})},'max03-learning-'+i);
  check(out.success,'synthetic_outcome_success');
  const events=engine.history.view('t1').slice(persisted);
  for(const event of events){await store.save('t1',event);persisted++;}
 }
 const rows=await store.history('t1',new Date(Date.now()+1000).toISOString());
 check(rows.length===persisted,'all_outcomes_saved');
 check((await store.history('t2',new Date(Date.now()+1000).toISOString())).length===0,'tenant_read_isolation');
 check((await store.history('t1',cutoff)).length===0,'temporal_cutoff_no_lookahead');
 let duplicate=false;try{await store.save('t1',engine.history.view('t1')[0]);}catch(e:any){duplicate=e.code==='DUPLICATE_OUTCOME';}
 check(duplicate,'duplicate_rejected');
 let crossWrite=false;try{await store.save('t2',engine.history.view('t1')[0]);}catch(e:any){crossWrite=e.code==='TENANT_MISMATCH';}
 check(crossWrite,'cross_tenant_write_rejected');
 let tamper=false;try{await db.unsafe("update coreos_product.orchestration_outcomes set observed_success=false where tenant_id='t1'");}
 catch(e:any){tamper=String(e).includes('COREOS_OUTCOME_APPEND_ONLY');}
 check(tamper,'append_only_update_rejected');
 await store.registerCandidate('t1','policy-candidate-1','baseline-v1');
 check((await store.candidate('t1','policy-candidate-1'))?.stage==='CANDIDATE','candidate_created');
 const ablation=JSON.parse(await Bun.file('MAX03_POLICY_ABLATION_RESULTS.json').text());
 let comparativeBlocked=false;
 try{await store.advance('t1','policy-candidate-1','OFFLINE_QUALIFIED',['MAX03_POLICY_ABLATION_RESULTS'],ablation);}
 catch(e:any){comparativeBlocked=e.code==='POLICY_COMPARATIVE_GATE_FAILED';}
 check(comparativeBlocked,'global_policy_negative_comparative_gate');
 let promotionBlocked=false;
 try{await store.advance('t1','policy-candidate-1','ACTIVE',['max03-synthetic-fixture']);}
 catch(e:any){promotionBlocked=e.code==='PRODUCTION_APPROVAL_REQUIRED';}
 check(promotionBlocked,'active_promotion_denied');
 check((await store.candidate('t1','policy-candidate-1'))?.stage==='CANDIDATE','candidate_not_misqualified');
 console.log(JSON.stringify({event:'MAX03_DURABLE_LEARNING_GATE',verdict:'PASS',persisted_outcomes:persisted,
   tenant_isolation:true,no_lookahead:true,append_only:true,production_promotion_blocked:true,
   comparative_promotion_blocked:true,policy_stage:'CANDIDATE',synthetic_only:true,db_schema_migration:5}));
}
try{await main();}catch(e:any){console.error(JSON.stringify({event:'MAX03_DURABLE_LEARNING_GATE',verdict:'FAIL',reason:String(e)}));process.exitCode=1;}
finally{await db.close();}
