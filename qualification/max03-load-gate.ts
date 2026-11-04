import {SQL} from 'bun';
import {createHmac,randomUUID} from 'node:crypto';
const db=new SQL(Bun.env.DATABASE_URL||'');
const secret=Bun.env.COREOS_AUTH_SECRET||'';
const port=String(Bun.env.PORT||34123),url='http://127.0.0.1:'+port;
const payload=Buffer.from(JSON.stringify({iss:'coreos',app_id:'max03-load-fixture',scopes:['requests:write','control:read'],exp:Math.floor(Date.now()/1000)+7200})).toString('base64url');
const auth='Bearer '+payload+'.'+createHmac('sha256',secret).update(payload).digest('base64url');
const work=(id:string,objective:string='MAX03_LOAD')=>({objective:objective+'_'+id,constraints:{},available_capabilities:['noop'],authority:{mode:'recommendation',allow_external_mutation:false},budget:{max_cost:1},state_reference:{},providers:[]});
const quantile=(list:number[],p:number)=>{const a=[...list].sort((x,y)=>x-y);return a[Math.max(0,Math.ceil(p*a.length)-1)]||0;};
let proc:any;const baseline:any={};
async function start(){
 proc=Bun.spawn({cmd:['bun','dist/coreos-1.2.0-rc.1.ts'],env:{...process.env,PORT:port,COREOS_RATE_LIMIT_PER_MINUTE:'20000'},stdout:'inherit',stderr:'inherit'});
 for(let i=0;i<60;i++){try{if((await fetch(url+'/readyz')).status===200)return;}catch{}await Bun.sleep(250);}throw Error('LOAD_RUNTIME_UNAVAILABLE');
}
async function call(body:any):Promise<{ms:number,status:number}>{
 const t=performance.now();const r=await fetch(url+'/v1/requests',{method:'POST',headers:{authorization:auth,'content-type':'application/json'},body:JSON.stringify(body)});
 await r.arrayBuffer();return{ms:performance.now()-t,status:r.status};
}
function invariant(x:any,name:string){if(!x)throw Error('MAX03_LOAD_ASSERT:'+name);}
async function ramp(concurrency:number,count:number){
 const seen:{ms:number,status:number}[]=Array(count);let cursor=0;const wallStarted=performance.now();
 await Promise.all(Array.from({length:concurrency},async()=>{
  while(cursor<count){const i=cursor++;seen[i]=await call(work(concurrency+'-'+i+'-'+randomUUID()));}
 }));
 const wallMs=performance.now()-wallStarted;
 const ms=seen.map(x=>x.ms),errors=seen.filter(x=>x.status!==201),elapsed=ms.reduce((a,b)=>a+b,0);
 const v={concurrency,count,errors:errors.length,p50_ms:quantile(ms,0.5),p95_ms:quantile(ms,0.95),p99_ms:quantile(ms,0.99),
  mean_ms:elapsed/count,wall_ms:wallMs,throughput_req_s:count/(wallMs/1000)};
 console.log(JSON.stringify({event:'MAX03_LOAD_RAMP',...v}));
 invariant(errors.length===0,'http_errors_concurrency_'+concurrency);
 return v;
}
async function main(){
 invariant(secret.length>=32&&!!Bun.env.DATABASE_URL,'isolated_credentials');
 const initial=await db.unsafe('select kill_switch from coreos_product.controls where id=1');
 invariant(initial[0].kill_switch===true,'kill_switch_initial');
 await start();
 const stages=[];for(const c of [1,4,16])stages.push(await ramp(c,96));
 const last=stages[2];
 invariant(last.p95_ms<=3000,'p95_limit_3000');
 invariant(last.p99_ms<=5000,'p99_limit_5000');
 invariant(last.throughput_req_s>=5,'throughput_min_5');
 const nodes=Array.from({length:1024},(_,i)=>({id:'cap'+String(i).padStart(4,'0'),depends_on:i?['cap'+String(i-1).padStart(4,'0')]:[],cost:1}));
 const dagBody={...work('dag1024'),available_capabilities:nodes,budget:{max_cost:1024}};
 const largeStart=performance.now(),dag=await call(dagBody),dagMs=performance.now()-largeStart;
 invariant(dag.status===201,'dag_1024_status');invariant(dagMs<=5000,'dag_1024_latency');
 const near=await call(work('near-limit','x'.repeat(1040000)));
 invariant(near.status===201,'near_max_accepted');
 const over=await call(work('above-limit','x'.repeat(1060000)));
 invariant(over.status===413,'above_max_rejected');
 const soakSecs=Number(Bun.env.MAX03_SOAK_SECONDS||0);
 const soak={duration_target_s:soakSecs,count:0,failed:0,actual_duration_s:0};
 if(soakSecs>0){
  invariant(soakSecs<=1900,'bounded_soak');
  const began=performance.now();
  while((performance.now()-began)/1000<soakSecs){
   const v=await call(work('soak-'+soak.count+'-'+randomUUID()));
   soak.count++;if(v.status!==201)soak.failed++;
   await Bun.sleep(900);
  }
  soak.actual_duration_s=(performance.now()-began)/1000;
  invariant(soak.failed===0,'soak_http_failures');
  invariant(soak.actual_duration_s>=soakSecs,'soak_duration');
 }
 const forks=await db.unsafe("select count(*)::integer n from (select previous_hash,lag(event_hash) over (order by seq) as prev from coreos_product.audit_events) a where prev is not null and previous_hash<>prev");
 invariant(forks[0].n===0,'audit_chain_continuity');
 const state=await db.unsafe('select kill_switch from coreos_product.controls where id=1');
 invariant(state[0].kill_switch===true,'kill_switch_final');
 console.log(JSON.stringify({event:'MAX03_LOAD_QUALIFICATION',verdict:'PASS',ramp:stages,dag_1024_ms:dagMs,near_max_status:near.status,above_limit_status:over.status,soak, audit_forks:forks[0].n,kill_switch:true,environment:'DISPOSABLE_POSTGRES_ONLY'}));
}
try{await main();}catch(e:any){console.error(JSON.stringify({event:'MAX03_LOAD_QUALIFICATION',verdict:'FAIL',reason:String(e)}));process.exitCode=1;}finally{
 if(proc){proc.kill();await proc.exited;}await db.close();
}
