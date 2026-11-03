from pathlib import Path
import json,hashlib
r=Path(__file__).resolve().parents[1]
parts=sorted((r/'src').glob('runtime.part*.ts'))
s=b''.join(p.read_bytes() for p in parts) if parts else (r/'src/runtime.ts').read_bytes()
text=s.decode()
forbidden=['DESIGN OS','LE CHAMP','Fractal','GENESIS','GMIS','CHCG','partition_id','coreos_v08','coreos_v12','coreos_v14','coreos_v16']
leaks=[x for x in forbidden if x in text]
required=['/healthz','/readyz','/v1/version','/v1/capabilities','/v1/requests','/v1/providers','/v1/control/kill-switch','/v1/audit','/v1/observability/summary','COREOS_INTEGRATION_CONTRACT_V1','COREOS_CAPACITY_POLICY_V1']
missing=[x for x in required if x not in text]
assert not leaks, leaks
assert not missing, missing
assert b"const VERSION = '1.1.0-rc.5'" in s
assert b"const BUILD = 'SELFCONTAINED_RC5'" in s
assert hashlib.sha256(s).hexdigest()=='580124cd5b14725bc941c341a73a774ef72f0b269ff02ee07fa119a0a99cc102'
for i in range(1,5): assert list((r/'migrations').glob(f'{i:03d}_*.sql'))
print(json.dumps({'pass':True,'forbidden_leaks':leaks,'missing_required':missing,'runtime_sha256':hashlib.sha256(s).hexdigest()}))
