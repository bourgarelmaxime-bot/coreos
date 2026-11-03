import { SQL } from 'bun';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { buildCapabilityPlan, PlannerError } from './capability-planner.ts';

const VERSION = '1.1.0-rc.5';
const BUILD = 'SELFCONTAINED_RC5';
const CONTRACT_VERSION = 'COREOS_INTEGRATION_CONTRACT_V1';
const POLICY_VERSION = 'COREOS_CAPACITY_POLICY_V1';
const PROVIDER_INTERFACES = Object.freeze([
  'CapabilityProvider','StateProvider','ResourceProvider','AuthorityProvider',
  'TelemetryProvider','ActionProvider','EvidenceSink'
]);
const MAX_BODY_BYTES = 1_048_576;
const RATE_LIMIT = Number(Bun.env.COREOS_RATE_LIMIT_PER_MINUTE || 120);
const AUTH_SECRET = Bun.env.COREOS_AUTH_SECRET || '';
if (AUTH_SECRET.length < 32) throw new Error('COREOS_AUTH_SECRET_REQUIRED');
if (!Bun.env.DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');
const db = new SQL(Bun.env.DATABASE_URL);
const counters = new Map<string,{minute:number,count:number}>();

const json = (body:any,status=200,traceId?:string) => new Response(JSON.stringify(body), {
  status,
  headers:{
    'content-type':'application/json',
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    'x-frame-options':'DENY',
    'referrer-policy':'no-referrer',
    'content-security-policy':"default-src 'none'",
    ...(traceId?{'x-correlation-id':traceId}:{})
  }
});
const err = (code:string,status:number,traceId:string,details?:any) => json({error:code,trace_id:traceId,...(details?{details}:{})},status,traceId);
const sha256 = (v:string) => createHash('sha256').update(v).digest('hex');
const stable = (v:any):string => {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '['+v.map(stable).join(',')+']';
  return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';
};
const nowIso = () => new Date().toISOString();

function verifyToken(token:string){
  if(!token) return {ok:false,code:'MISSING_CREDENTIALS'} as const;
  const parts=token.split('.');
  if(parts.length!==2) return {ok:false,code:'INVALID_CREDENTIALS'} as const;
  const [payload,sig]=parts;
  const expected=createHmac('sha256',AUTH_SECRET).update(payload).digest('base64url');
  const a=Buffer.from(sig), b=Buffer.from(expected);
  if(a.length!==b.length || !timingSafeEqual(a,b)) return {ok:false,code:'INVALID_CREDENTIALS'} as const;
  let claims:any;
  try{ claims=JSON.parse(Buffer.from(payload,'base64url').toString('utf8')); }catch{return {ok:false,code:'INVALID_CREDENTIALS'} as const;}
  if(claims.iss!=='coreos' || !claims.app_id || !Array.isArray(claims.scopes)) return {ok:false,code:'INVALID_CREDENTIALS'} as const;
  if(!claims.exp || claims.exp<=Math.floor(Date.now()/1000)) return {ok:false,code:'EXPIRED_CREDENTIALS'} as const;
  return {ok:true,claims} as const;
}
const hasScope=(claims:any,scope:string)=>claims.scopes.includes(scope)||claims.scopes.includes('*');
function allowRate(app:string){
  const minute=Math.floor(Date.now()/60000); const cur=counters.get(app);
  if(!cur || cur.minute!==minute){counters.set(app,{minute,count:1});return true;}
  cur.count++; return cur.count<=RATE_LIMIT;
}
function validateRequest(b:any){
  const e:string[]=[];
  if(!b || typeof b!=='object' || Array.isArray(b)) e.push('BODY_REQUIRED');
  if(!b?.objective || (typeof b.objective!=='string' && typeof b.objective!=='object')) e.push('OBJECTIVE_REQUIRED');
  if(!b?.constraints || typeof b.constraints!=='object' || Array.isArray(b.constraints)) e.push('CONSTRAINTS_REQUIRED');
  if(!Array.isArray(b?.available_capabilities)) e.push('AVAILABLE_CAPABILITIES_REQUIRED');
  if(!b?.authority || typeof b.authority!=='object' || typeof b.authority.mode!=='string') e.push('AUTHORITY_REQUIRED');
  if(!b?.budget || typeof b.budget!=='object' || !Number.isFinite(Number(b.budget.max_cost))) e.push('BUDGET_REQUIRED');
  if(b?.state_reference===undefined) e.push('STATE_REFERENCE_REQUIRED');
  if(!Array.isArray(b?.providers)) e.push('PROVIDERS_REQUIRED');
  if(Array.isArray(b?.providers) && b.providers.some((p:any)=>!PROVIDER_INTERFACES.includes(p?.interface))) e.push('PROVIDER_CONTRACT_MISMATCH');
  return e;
}
function validateProvider(b:any){
  const e:string[]=[];
  if(!b?.adapter_id || typeof b.adapter_id!=='string') e.push('ADAPTER_ID_REQUIRED');
  if(!b?.version || typeof b.version!=='string') e.push('ADAPTER_VERSION_REQUIRED');
  if(!Array.isArray(b?.interfaces)||b.interfaces.some((x:any)=>!PROVIDER_INTERFACES.includes(x))) e.push('PROVIDER_INTERFACES_INVALID');
  if(!Array.isArray(b?.capabilities)) e.push('CAPABILITIES_REQUIRED');
  if(!Array.isArray(b?.required_permissions)) e.push('REQUIRED_PERMISSIONS_REQUIRED');
  if(!b?.mutation_surface || typeof b.mutation_surface!=='object') e.push('MUTATION_SURFACE_REQUIRED');
  if(!b?.timeout || typeof b.timeout!=='object') e.push('TIMEOUT_REQUIRED');
  if(typeof b?.rollback_capability!=='boolean') e.push('ROLLBACK_CAPABILITY_REQUIRED');
  return e;
}

async function getControls(){const r=await db`select kill_switch,paused from coreos_product.controls where id=1`;return r[0]||{kill_switch:true,paused:false};}
async function setKillSwitch(v:boolean){await db`update coreos_product.controls set kill_switch=${v},updated_at=now() where id=1`;}
async function appendEvidence(executionId:string,event:any){await db`insert into coreos_product.evidence(event_id,execution_id,app_id,trace_id,event,ts) values(${event.event_id},${executionId},${event.app_id},${event.trace_id},${event},${event.ts}) on conflict(event_id) do nothing`;}
async function appendAudit(event:any){
  const prev=await db`select event_hash from coreos_product.audit_events order by seq desc limit 1`;
  const previous=prev[0]?.event_hash||'AUDIT_ROOT'; const payload=stable(event); const eventHash=sha256(previous+'|'+payload);
  await db`insert into coreos_product.audit_events(event_id,app_id,event_type,event,previous_hash,event_hash,ts) values(${event.event_id},${event.app_id},${event.type||'EVENT'},${event},${previous},${eventHash},${event.ts}) on conflict(event_id) do nothing`;
}
function evidenceEvent({appId,requestId,executionId,traceId,type,observed=null,decision=null,reason=null,action=null,effect=null,cost=null}:any){return{event_id:randomUUID(),ts:nowIso(),app_id:appId,request_id:requestId,execution_id:executionId,trace_id:traceId,type,policy_version:POLICY_VERSION,observed,decision,reason,action,effect,cost};}
