// MAX04 red/green: deterministic cancel/start race on a disposable PostgreSQL 17 fixture.
// Never run against production: creates and removes a test-only delay trigger.
import {SQL} from 'bun';
import {createHmac,randomUUID} from 'node:crypto';
const db=new SQL(Bun.env.DATABASE_URL||'');
const port=Number(Bun.env.PORT||34123),host='http://127.0.0.1:'+port,secret=Bun.env.COREOS_AUTH_SECRET||'';
const app='max04-race';
const scopes=['requests:write','requests:read','executions:execute','executions:read','control:read','evidence:read'];
const claim=Buffer.from(JSON.stringify({iss:'coreos',app_id:app,scopes,exp:Math.floor(Date.now()/1000)+900})).toString('base64url');
const token=claim+'.'+createHmac('sha256',secret).update(claim).digest('base64url');
let proc:any=null,installed=false;
function invariant(ok:any,msg:string){if(!ok)throw Error('MAX04_RACE_ASSERT:'+msg);}
const headers={authorization:'Bearer '+token,'content-type':'application/json'};
async function api(path:string,method='GET',body:any=undefined){
 const r=await fetch(host+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 return {status:r.status,data:await r.json()};
}
async function boot(){
 proc=Bun.spawn({cmd:['bun','dist/coreos-1.2.0-rc.1.ts'],env:{...process.env,PORT:String(port),COREOS_RATE_LIMIT_PER_MINUTE:'1000'},stdout:'inherit',stderr:'inherit'});
 for(let i=0;i<100;i++){try{if((await fetch(host+'/readyz')).status===200)return;}catch{}await Bun.sleep(150);}
 throw Error('RUNTIME_NOT_READY');
}
async function main(){
 invariant(secret.length>=32&&!!Bun.env.DATABASE_URL,'test_credentials');
 const ctl=await db`select kill_switch from coreos_product.controls where id=1`;
 invariant(ctl[0]?.kill_switch===true,'precondition_switch_on');
 await boot();
 const payload={objective:'MAX04_RACE_'+randomUUID(),constraints:{},available_capabilities:['noop'],authority:{mode:'execute',allow_external_mutation:false},budget:{max_cost:1},state_reference:{},providers:[]};
 const created=await api('/v1/requests','POST',payload);
 invariant(created.status===201,'created_execution_201');
 const id=created.data.execution_id,reqId=created.data.request_id;
 // Delay only the fixture's STARTED evidence, after the RUNNING claim.
 // This forces CANCELLED to commit before the old worker reaches completion.
 await db.unsafe(`CREATE OR REPLACE FUNCTION coreos_product.max04_delay_started() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.app_id='max04-race' AND NEW.event->>'type'='EXECUTION_STARTED' THEN PERFORM pg_sleep(1.5); END IF; RETURN NEW; END; $$;`);
 await db.unsafe(`CREATE TRIGGER max04_delay_started BEFORE INSERT ON coreos_product.evidence FOR EACH ROW EXECUTE FUNCTION coreos_product.max04_delay_started()`);
 installed=true;
 await db`update coreos_product.controls set kill_switch=false,updated_at=now() where id=1`;
 const starting=api('/v1/executions/'+id+'/start','POST',{});
 let running=false;
 for(let i=0;i<80;i++){
   const rows=await db`select status from coreos_product.executions where execution_id=${id}`;
   if(rows[0]?.status==='RUNNING'){running=true;break;}
   await Bun.sleep(15);
 }
 invariant(running,'execution_entered_running');
 const cancel=await api('/v1/requests/'+reqId+'/cancel','POST',{});
 invariant(cancel.status===200,'cancel_during_active_execution');
 const started=await starting;
 const states=await db`select (select status from coreos_product.requests where request_id=${reqId}) as request_status,(select status from coreos_product.executions where execution_id=${id}) as execution_status`;
 const evidence=await db`select event->>'type' as type from coreos_product.evidence where execution_id=${id} order by seq`;
 console.log(JSON.stringify({event:'MAX04_CANCEL_START_RACE',start_http:started.status,
    cancellation_http:cancel.status,request_status:states[0]?.request_status,execution_status:states[0]?.execution_status,
    evidence_types:evidence.map((v:any)=>v.type)}));
 invariant(states[0].request_status==='CANCELLED','cancel_not_overwritten_request');
 invariant(states[0].execution_status==='CANCELLED','cancel_not_overwritten_execution');
 invariant(!evidence.some((x:any)=>x.type==='EXECUTION_SUCCEEDED'),'no_postcancel_success_evidence');
 const control=await db`select kill_switch from coreos_product.controls where id=1`;
 invariant(control[0]?.kill_switch===false,'control_stable_during_fixture');
 console.log(JSON.stringify({event:'MAX04_CANCEL_RACE_GATE',verdict:'PASS',cancel_wins:true,external_mutations:0,execution_id:id}));
}
try{await main();}catch(e:any){
 console.error(JSON.stringify({event:'MAX04_CANCEL_RACE_GATE',verdict:'FAIL',error:String(e)}));process.exitCode=1;
}finally{
 try{await db`update coreos_product.controls set kill_switch=true,updated_at=now() where id=1`;}catch{}
 if(installed){try{await db.unsafe('DROP TRIGGER IF EXISTS max04_delay_started ON coreos_product.evidence');}catch{}}
 try{await db.unsafe('DROP FUNCTION IF EXISTS coreos_product.max04_delay_started()');}catch{}
 if(proc){proc.kill();await proc.exited;}
 await db.close();
}
