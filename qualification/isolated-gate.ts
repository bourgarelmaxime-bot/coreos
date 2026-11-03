import { SQL } from 'bun';
import { createHash, createHmac } from 'node:crypto';
const sql=new SQL(Bun.env.DATABASE_URL||'');
const PORT=String(Bun.env.PORT||34123),URL='http://127.0.0.1:'+PORT;
const ARTIFACT='dist/coreos-1.2.0-rc.1.ts',SECRET=Bun.env.COREOS_AUTH_SECRET||'';
const scopes=['requests:write','requests:read','executions:read','executions:execute','evidence:read','control:read','control:kill','audit:read','observability:read'];
let child:any=null;const passed:string[]=[];
function ok(value:any,label:string){if(!value)throw new Error('ASSERT:'+label);}
function auth(app:string,s=scopes,expired=false){
 const p=Buffer.from(JSON.stringify({iss:'coreos',app_id:app,scopes:s,exp:Math.floor(Date.now()/1000)+(expired?-10:900)})).toString('base64url');
 return p+'.'+createHmac('sha256',SECRET).update(p).digest('base64url');
}
function statements(src:string){
 const out:string[]=[];let cur='',sq=false,dollar=false;
 for(let i=0;i<src.length;i++){let c=src[i];
  if(!sq&&src.slice(i,i+2)==='$$'){dollar=!dollar;cur+='$$';i++;continue;}
  if(!dollar&&c==="'"){if(sq&&src[i+1]==="'"){cur+="''";i++;continue;}sq=!sq;}
  if(c===';'&&!sq&&!dollar){const t=cur.trim();if(t&&!['BEGIN','COMMIT'].includes(t))out.push(t);cur='';}else cur+=c;
 }return out;
}
async function bootstrap(){
 for(const file of ['001_product_schema','002_append_only_audit','003_compatibility_indexes','004_jsonb_object_compatibility']){
  for(const q of statements(await Bun.file('migrations/'+file+'.sql').text()))await sql.unsafe(q);
 }
}
async function start(){
 child=Bun.spawn({cmd:['bun',ARTIFACT],env:{...process.env,PORT},stdout:'inherit',stderr:'inherit'});
 for(let i=0;i<70;i++){
  try{if((await fetch(URL+'/readyz')).status===200)return;}catch{}
  if(child.exitCode!==null)break;
  await Bun.sleep(300);
 }throw Error('RUNTIME_NOT_READY');
}
async function stop(){if(child){child.kill();await child.exited;child=null;}}
async function call(name:string,path:string,method='GET',token='',body:any=undefined,status=200,error=''){
 const headers:Record<string,string>={'content-type':'application/json'};if(token)headers.authorization='Bearer '+token;
 const resp=await fetch(URL+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 const result:any=await resp.json();
 ok(resp.status===status,name+'_status_'+resp.status+'_expected_'+status+':'+JSON.stringify(result).slice(0,120));
 if(error)ok(result.error===error,name+'_error_'+result.error);
 passed.push(name);return result;
}
function req(caps:any[],budget:number,mode='recommendation',providers:any[]=[]){
 return {objective:'SYNTHETIC_QUALIFICATION',constraints:{},available_capabilities:caps,authority:{mode,allow_external_mutation:false},budget:{max_cost:budget},state_reference:{},providers};
}
async function main(){
 ok(SECRET.length>=32,'secret');ok(!!Bun.env.DATABASE_URL,'database');
 const sha=createHash('sha256').update(new Uint8Array(await Bun.file(ARTIFACT).arrayBuffer())).digest('hex');
 if(Bun.env.COREOS_BOOTSTRAP_SQL==='1')await bootstrap();
 const m=await sql.unsafe('select count(*)::integer n from coreos_product.schema_migrations');
 ok(m[0].n===4,'migrations_001_004');
 const switches=await sql.unsafe('select kill_switch from coreos_product.controls where id=1');
 ok(switches[0].kill_switch===true,'initial_kill_switch');
 await start();
 await call('health','/healthz');await call('ready','/readyz');
 const version=await call('identity','/v1/version','GET',auth('a'));
 ok(version.version==='1.2.0-rc.1'&&version.build==='COREOS_1_2_RC1','exact_artifact_identity');
 await call('no_auth','/v1/requests','POST','',req(['a'],1),401,'MISSING_CREDENTIALS');
 await call('expired','/v1/requests','POST',auth('a',scopes,true),req(['a'],1),401,'EXPIRED_CREDENTIALS');
 await call('scope_denied','/v1/requests','POST',auth('a',['requests:read']),req(['a'],1),403,'INSUFFICIENT_SCOPE');
 const graph=await call('DAG','/v1/requests','POST',auth('a'),
 req([{id:'release',depends_on:['review']},{id:'draft'},{id:'review',depends_on:['draft']}],3),201);
 ok(JSON.stringify(graph.plan.graph.execution_order)==='["draft","review","release"]','DAG_order');
 await call('cycle','/v1/requests','POST',auth('a'),req([{id:'a',depends_on:['b']},{id:'b',depends_on:['a']}],2),400,'CAPABILITY_DEPENDENCY_CYCLE');
 await call('missing_dependency','/v1/requests','POST',auth('a'),req([{id:'a',depends_on:['z']}],1),400,'MISSING_CAPABILITY_DEPENDENCY');
 await call('duplicate','/v1/requests','POST',auth('a'),req(['a','a'],2),400,'DUPLICATE_CAPABILITY');
 await call('budget','/v1/requests','POST',auth('a'),req([{id:'a',cost:3}],2),422,'BUDGET_EXCEEDED');
 await call('tenant_isolation','/v1/requests/'+graph.request_id,'GET',auth('b'),undefined,403,'FORBIDDEN');
 const provider={interface:'ActionProvider',adapter_id:'restricted',capabilities:['execute'],required_permissions:['restricted:execute'],mutation_surface:{external:false}};
 const pr=req([{id:'action',required_interfaces:['ActionProvider'],required_provider_capabilities:['execute']}],1,'recommendation',[provider]);
 await call('provider_permission_denied','/v1/requests','POST',auth('a'),pr,400,'UNRESOLVED_PROVIDER_REQUIREMENT');
 const valid=await call('provider_permission_granted','/v1/requests','POST',auth('a',[...scopes,'restricted:execute']),pr,201);
 ok(valid.plan.provider_assignments.action.includes('restricted'),'provider_assignment');
 await call('external_mutation_denied','/v1/requests','POST',auth('a'),
 {...req(['a'],1,'execute'),authority:{mode:'execute',allow_external_mutation:true}},403,'AUTHORITY_CONTRADICTION');
 const execution=await call('create_execution','/v1/requests','POST',auth('a'),req(['noop'],1,'execute'),201);
 await call('kill_switch_blocks','/v1/executions/'+execution.execution_id+'/start','POST',auth('a'),{},423,'KILL_SWITCH_ENGAGED');
 await call('switch_off_isolated','/v1/control/kill-switch','POST',auth('a'),{engaged:false},200);
 try{
  const started=await call('noop_execution','/v1/executions/'+execution.execution_id+'/start','POST',auth('a'),{},200);
  ok(started.status==='SUCCEEDED'&&started.result.external_mutations===0,'no_external_mutation');
 }finally{await call('switch_restored','/v1/control/kill-switch','POST',auth('a'),{engaged:true},200);}
 const receipt=await call('receipt','/v1/executions/'+execution.execution_id+'/receipt','GET',auth('a'));
 ok(receipt.evidence_count>0&&receipt.build==='COREOS_1_2_RC1','receipt_content');
 const evidence=await call('graph_evidence','/v1/executions/'+graph.execution_id+'/evidence','GET',auth('a'));
 ok(evidence.items.some((v:any)=>v.type==='PLAN_CREATED'&&v.observed.graph_edges===2),'graph_evidence');
 let blocked=false;try{await sql.unsafe("update coreos_product.audit_events set event_type='FORGED' where app_id='a'");}catch(e:any){blocked=String(e).includes('COREOS_AUDIT_APPEND_ONLY');}
 ok(blocked,'audit_append_only');passed.push('audit_append_only');
 await stop();await start();
 const result=await call('restart_persistence','/v1/executions/'+execution.execution_id+'/result','GET',auth('a'));
 ok(result.status==='SUCCEEDED','persisted_result');
 const ctl=await call('restart_kill_switch','/v1/control/state','GET',auth('a'));
 ok(ctl.kill_switch===true,'safe_restart');
 console.log(JSON.stringify({event:'COREOS_ISOLATED_GATE',verdict:'PASS',tests:passed,count:passed.length,
 version:version.version,build:version.build,artifact_sha256:sha,fixture_request_id:execution.request_id,fixture_execution_id:execution.execution_id,
 migrations:4,kill_switch:true,external_mutations:0}));
 if(Bun.env.COREOS_QUAL_KEEP_ALIVE==='1'){console.log(JSON.stringify({event:'COREOS_QUAL_READY',port:PORT}));await child.exited;}
 else await stop();
}
try{await main();}catch(e:any){
 console.error(JSON.stringify({event:'COREOS_ISOLATED_GATE',verdict:'FAIL',tests:passed,error:String(e)}));
 try{await sql.unsafe('update coreos_product.controls set kill_switch=true where id=1');}catch{}
 await stop();process.exit(1);
}
