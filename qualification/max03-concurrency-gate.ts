import {SQL} from 'bun';
import {createHmac,randomUUID} from 'node:crypto';
const sql=new SQL(Bun.env.DATABASE_URL||'');
const secret=Bun.env.COREOS_AUTH_SECRET||'';
const address='http://127.0.0.1:'+String(Bun.env.PORT||34123);
const tokenPayload=Buffer.from(JSON.stringify({iss:'coreos',app_id:'max03-fixture',scopes:['requests:write','control:kill'],exp:Math.floor(Date.now()/1000)+1200})).toString('base64url');
const auth='Bearer '+tokenPayload+'.'+createHmac('sha256',secret).update(tokenPayload).digest('base64url');
const request=(id:string)=>({objective:'MAX03_CONCURRENCY_'+id,constraints:{},available_capabilities:['a'],authority:{mode:'recommendation',allow_external_mutation:false},budget:{max_cost:1},state_reference:{},providers:[]});
let proc:any;
async function boot(){
 proc=Bun.spawn({cmd:['bun','dist/coreos-1.2.0-rc.1.ts'],env:{...process.env,PORT:String(Bun.env.PORT||34123),COREOS_RATE_LIMIT_PER_MINUTE:'1000'},stdout:'inherit',stderr:'inherit'});
 for(let i=0;i<60;i++){try{if((await fetch(address+'/readyz')).status===200)return;}catch{}await Bun.sleep(250);}
 throw Error('GATE_RUNTIME_NOT_READY');
}
function assert(x:any,msg:string){if(!x)throw Error('MAX03_GATE_ASSERT:'+msg);}
async function submit(body:any,key:string){
 const r=await fetch(address+'/v1/requests',{method:'POST',headers:{Authorization:auth,'content-type':'application/json','idempotency-key':key},body:JSON.stringify(body)});
 return{status:r.status,json:await r.json()};
}
async function main(){
 assert(secret.length>=32,'SECRET');
 await boot();
 // Frozen safety acceptance before measurement:
 // 24 concurrent identical idempotency-key calls must produce exactly one request/execution.
 const key='max03-idem-'+randomUUID(),body=request('idem');
 const wave=await Promise.all(Array.from({length:24},()=>submit(body,key)));
 const unexpected=wave.filter(x=>x.status!==201);
 const ids=[...new Set(wave.map(x=>x.json.request_id).filter(Boolean))];
 console.log(JSON.stringify({event:'MAX03_IDEMPOTENCY_RACE',concurrency:24,http_status_counts:Object.fromEntries([...new Set(wave.map(x=>x.status))].map(s=>[s,wave.filter(r=>r.status===s).length])),unique_requests:ids.length,unexpected:unexpected.length}));
 assert(unexpected.length===0,'concurrent_idem_status');
 assert(ids.length===1,'concurrent_idem_exactly_one');
 // Several distinct keys must maintain a single unbroken audit hash chain.
 const batch=await Promise.all(Array.from({length:24},(_,i)=>submit(request('distinct-'+i),'max03-distinct-'+randomUUID())));
 assert(batch.every(x=>x.status===201),'distinct_key_success');
 const forks=await sql.unsafe("select count(*)::integer AS n from (select previous_hash,lag(event_hash) over (order by seq) AS predecessor from coreos_product.audit_events) ordered where predecessor is not null and previous_hash<>predecessor");
 assert(forks[0].n===0,'audit_chain_forks');
 const orphan=await sql.unsafe("select count(*)::integer AS n from coreos_product.requests r left join coreos_product.executions e on e.request_id=r.request_id where e.request_id is null");
 assert(orphan[0].n===0,'orphan_requests');
 // Negative safety test: missing boolean must not DISENGAGE kill switch.
 const invalid=await fetch(address+'/v1/control/kill-switch',{method:'POST',headers:{Authorization:auth,'content-type':'application/json'},body:'{}'});
 const bad=await invalid.json();
 const kill=await sql.unsafe('select kill_switch from coreos_product.controls where id=1');
 assert(kill[0].kill_switch===true,'empty_control_payload_fail_closed');
 assert(invalid.status===400,'empty_control_payload_rejected');
 console.log(JSON.stringify({event:'MAX03_CONCURRENCY_GATE',verdict:'PASS',concurrency:24,wave_count:48,unique_idempotent_requests:ids.length,audit_forks:forks[0].n,orphans:orphan[0].n,kill_switch:true}));
}
try{await main();}catch(e:any){console.error(JSON.stringify({event:'MAX03_CONCURRENCY_GATE',verdict:'FAIL',reason:String(e)}));process.exitCode=1;}finally{
 try{await sql.unsafe('update coreos_product.controls set kill_switch=true,updated_at=now() where id=1');}catch{}
 if(proc){proc.kill();await proc.exited;}
 await sql.close();
}
