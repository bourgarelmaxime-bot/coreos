from pathlib import Path
import gzip,base64,hashlib,re
root=Path(__file__).resolve().parents[1]
parts=sorted((root/'src').glob('runtime.part*.ts'))
if parts:
    src=b''.join(p.read_bytes() for p in parts)
else:
    src=(root/'src/runtime.ts').read_bytes()
planner=(root/'src/capability-planner.ts').read_bytes()
text=src.decode()
version=re.search(r"const VERSION = '([^']+)'",text).group(1)
build=re.search(r"const BUILD = '([^']+)'",text).group(1)
sha=hashlib.sha256(src).hexdigest()
planner_sha=hashlib.sha256(planner).hexdigest()
packed=base64.b64encode(gzip.compress(src,9,mtime=0)).decode()
planner_packed=base64.b64encode(gzip.compress(planner,9,mtime=0)).decode()
wrapper=f"""import {{ gunzipSync }} from 'node:zlib';
import {{ createHash }} from 'node:crypto';
const packed={packed!r};
const plannerPacked={planner_packed!r};
const source=gunzipSync(Buffer.from(packed,'base64'));
const plannerSource=gunzipSync(Buffer.from(plannerPacked,'base64'));
const actual=createHash('sha256').update(source).digest('hex');
const plannerActual=createHash('sha256').update(plannerSource).digest('hex');
const expected={sha!r};
const plannerExpected={planner_sha!r};
if(actual!==expected) throw new Error(`COREOS_ARTIFACT_HASH_MISMATCH:${{actual}}`);
if(plannerActual!==plannerExpected) throw new Error(`COREOS_PLANNER_ARTIFACT_HASH_MISMATCH:${{plannerActual}}`);
await Bun.write('/tmp/coreos-runtime.ts',source);
await Bun.write('/tmp/capability-planner.ts',plannerSource);
console.log(JSON.stringify({{event:'COREOS_SELF_CONTAINED_ARTIFACT_VERIFIED',release:{version!r},build:{build!r},artifact_sha256:actual,planner_sha256:plannerActual,bytes:source.length+plannerSource.length}}));
await import('file:///tmp/coreos-runtime.ts');
"""
out=root/'dist'/f'coreos-{version}.ts';out.parent.mkdir(exist_ok=True);out.write_text(wrapper)
(root/'dist'/f'coreos-{version}.sha256').write_text(hashlib.sha256(wrapper.encode()).hexdigest()+'  '+out.name+'\n')
print(version,build,sha,planner_sha,out)
