from pathlib import Path
import json,hashlib,os
r=Path(__file__).resolve().parents[1]
parts=sorted((r/'src').glob('runtime.part*.ts'))
s=b''.join(p.read_bytes() for p in parts) if parts else (r/'src/runtime.ts').read_bytes()
planner=(r/'src/capability-planner.ts').read_bytes()
text=s.decode()+planner.decode()
forbidden=['DESIGN OS','LE CHAMP','Fractal','GENESIS','GMIS','CHCG','partition_id','coreos_v08','coreos_v12','coreos_v14','coreos_v16']
leaks=[x for x in forbidden if x in text]
required=['/healthz','/readyz','/v1/version','/v1/capabilities','/v1/requests','/v1/providers','/v1/control/kill-switch','/v1/audit','/v1/observability/summary','COREOS_INTEGRATION_CONTRACT_V1','COREOS_CAPACITY_POLICY_V1','COREOS_CAPABILITY_GRAPH_PLANNER_V1']
missing=[x for x in required if x not in text]
assert not leaks, leaks
assert not missing, missing
assert b"const VERSION = '" in s
assert b"const BUILD = '" in s
runtime_sha=hashlib.sha256(s).hexdigest()
planner_sha=hashlib.sha256(planner).hexdigest()
expected=os.getenv('COREOS_EXPECTED_RUNTIME_SHA256')
if expected: assert runtime_sha==expected,(runtime_sha,expected)
for i in range(1,5): assert list((r/'migrations').glob(f'{i:03d}_*.sql'))
print(json.dumps({'pass':True,'forbidden_leaks':leaks,'missing_required':missing,'runtime_sha256':runtime_sha,'planner_sha256':planner_sha}))
