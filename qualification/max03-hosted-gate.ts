import {SQL} from 'bun';
// Isolated Railway qualification only, without any production application providers.
const stages=['qualification/isolated-gate.ts','qualification/max03-concurrency-gate.ts','qualification/max04-cancel-race.ts','qualification/max03-load-gate.ts'];
const env={...process.env,COREOS_QUAL_KEEP_ALIVE:'0',COREOS_BOOTSTRAP_SQL:'0',MAX03_SOAK_SECONDS:'0'};
let db:SQL|null=null;
try{
 if(!Bun.env.DATABASE_URL)throw Error('DATABASE_URL_REQUIRED');
 db=new SQL(Bun.env.DATABASE_URL);
 const m=await db`select count(*)::integer n from coreos_product.schema_migrations`;
 if(m[0]?.n!==4)throw Error('ISOLATED_PG_SCHEMA_UNEXPECTED');
 for(const stage of stages){
   console.log(JSON.stringify({event:'MAX03_HOSTED_STAGE_START',stage}));
   const proc=Bun.spawn({cmd:['bun','run',stage],env,stdout:'inherit',stderr:'inherit'});
   const exit=await proc.exited;
   if(exit!==0)throw Error('HOSTED_STAGE_FAILED:'+stage+':'+exit);
   console.log(JSON.stringify({event:'MAX03_HOSTED_STAGE_PASS',stage}));
 }
 await db`update coreos_product.controls set kill_switch=true,updated_at=now() where id=1`;
 const ctl=await db`select kill_switch from coreos_product.controls where id=1`;
 if(ctl[0]?.kill_switch!==true)throw Error('KILL_SWITCH_NOT_ENGAGED');
 console.log(JSON.stringify({event:'MAX03_HOSTED_QUALIFICATION',verdict:'PASS',stages,kill_switch:true,external_mutations:0}));
 await db.close();db=null;
 const runtime=Bun.spawn({cmd:['bun','dist/coreos-1.2.0-rc.1.ts'],env:{...process.env,COREOS_QUAL_KEEP_ALIVE:'0'},stdout:'inherit',stderr:'inherit'});
 const exit=await runtime.exited;
 throw Error('QUALIFIED_RUNTIME_EXITED:'+exit);
}catch(e:any){
 console.error(JSON.stringify({event:'MAX03_HOSTED_QUALIFICATION',verdict:'FAIL',error:String(e)}));
 if(db){try{await db`update coreos_product.controls set kill_switch=true where id=1`;}catch{}}
 process.exit(1);
}
