// MAX04 bounded fault injection: pause a disposable Postgres 17 CI service, then unpause.
// This must NEVER run with a production DB URL or uncontrolled Docker container ID.
import {SQL} from 'bun';
import {createHmac,randomUUID} from 'node:crypto';
const db=new SQL(Bun.env.DATABASE_URL||'');
const serviceId=Bun.env.POSTGRES_CONTAINER_ID||'',port=String(Bun.env.PORT||34123);
const base='http://127.0.0.1:'+port,secret=Bun.env.COREOS_AUTH_SECRET||'';
const claim=Buffer.from(JSON.stringify({iss:'coreos',app_id:'max04-recovery',scopes:['requests:write','requests:read'],exp:Math.floor(Date.now()/1000)+900})).toString('base64url');
const token=claim+'.'+createHmac('sha256',secret).update(claim).digest('base64url');
let child:any=null,paused=false;
function assert(x:any,why:string){if(!x)throw Error('MAX04_DB_FAULT_ASSERT:'+why);}
function docker(command:'pause'|'unpause'){
 const result=Bun.spawnSync(['docker',command,serviceId],{stdout:'pipe',stderr:'pipe'});
 assert(result.exitCode===0,'docker_'+command+'_failed_'+new TextDecoder().decode(result.stderr).slice(0,100));
}
async function ready(timeout=1200){
 try{
  const response=await fetch(base+'/readyz',{signal:AbortSignal.timeout(timeout)});
  return response.status;
 }catch{return 0;}
}
async function main(){
 assert(Boolean(Bun.env.DATABASE_URL)&&secret.length>=32,'test_env');
 // Only allow the explicitly named disposable postgres service from the GitHub runner.
 assert(/(^|\W)(qual_local_only)(\W|$)/.test(Bun.env.DATABASE_URL||''),'NON_DISPOSABLE_DATABASE_FORBIDDEN');
 assert(/^[a-f0-9]{32,64}$/i.test(serviceId),'SERVICE_CONTAINER_ID_REQUIRED');
 const pre=await db`select (select count(*)::integer from coreos_product.schema_migrations) as migrations,(select count(*)::integer from coreos_product.requests) as requests,(select kill_switch from coreos_product.controls where id=1) as kill_switch`;
 assert(pre[0].migrations===4&&pre[0].kill_switch===true,'baseline_not_safe');
 child=Bun.spawn({cmd:['bun','dist/coreos-1.2.0-rc.1.ts'],env:{...process.env,PORT:port},stdout:'inherit',stderr:'inherit'});
 for(let i=0;i<80;i++){if(await ready(400)===200)break;await Bun.sleep(150);}
 assert(await ready()===200,'baseline_not_ready');
 docker('pause');paused=true;
 // An unavailable DB may result in a bounded timeout instead of 503.
 const down=await ready(1300);
 assert(down!==200,'readiness_fail_open_during_db_outage');
 const pausedAt=performance.now();
 docker('unpause');paused=false;
 let recovered=false;
 for(let i=0;i<120;i++){if(await ready(700)===200){recovered=true;break;}await Bun.sleep(200);}
 const rto=performance.now()-pausedAt;
 assert(recovered,'db_reconnection_not_recovered');
 const id='max04-outage-'+randomUUID(),request={objective:'MAX04_DB_RECOVERY',constraints:{},available_capabilities:['noop'],authority:{mode:'recommendation',allow_external_mutation:false},budget:{max_cost:1},state_reference:{},providers:[]};
 const headers={authorization:'Bearer '+token,'content-type':'application/json','idempotency-key':id};
 const write=async()=>{const r=await fetch(base+'/v1/requests',{method:'POST',headers,body:JSON.stringify(request)});return{status:r.status,data:await r.json()};};
 const first=await write(),second=await write();
 assert(first.status===201&&second.status===201,'post_recovery_http');
 assert(first.data.request_id===second.data.request_id&&second.data.replayed===true,'post_recovery_idempotency');
 const post=await db`select (select count(*)::integer from coreos_product.requests) as requests,(select kill_switch from coreos_product.controls where id=1) as kill_switch`;
 assert(post[0].kill_switch===true,'control_not_fail_closed');
 assert(post[0].requests===pre[0].requests+1,'outage_atomic_persistence');
 const forks=await db.unsafe("select count(*)::int n from (select previous_hash,lag(event_hash) over(order by seq) prev from coreos_product.audit_events) e where prev is not null and previous_hash<>prev");
 assert(forks[0].n===0,'audit_forks_after_outage');
 console.log(JSON.stringify({event:'MAX04_DB_FAULT_GATE',verdict:'PASS',outage_mode:'DOCKER_PAUSE_DISPOSABLE_POSTGRES',ready_during_outage:down,recovery_ms:rto,
  initial_requests:pre[0].requests,final_requests:post[0].requests,audit_forks:forks[0].n,kill_switch:true,external_mutations:0}));
}
try{await main();}catch(e:any){console.error(JSON.stringify({event:'MAX04_DB_FAULT_GATE',verdict:'FAIL',reason:String(e)}));process.exitCode=1;}
finally{
 if(paused){try{docker('unpause');}catch{}}
 if(child){child.kill();await child.exited;}
 await db.close();
}
