from pathlib import Path
import gzip,base64,hashlib,re
root=Path(__file__).resolve().parents[1]
parts=sorted((root/'src').glob('runtime.part*.ts'))
if parts:
    src=b''.join(p.read_bytes() for p in parts)
else:
    src=(root/'src/runtime.ts').read_bytes()
text=src.decode()
version=re.search(r"const VERSION = '([^']+)'",text).group(1)
build=re.search(r"const BUILD = '([^']+)'",text).group(1)
sha=hashlib.sha256(src).hexdigest()
packed=base64.b64encode(gzip.compress(src,9,mtime=0)).decode()
wrapper=f"""import {{ gunzipSync }} from 'node:zlib';
import {{ createHash }} from 'node:crypto';
const packed={packed!r};
const source=gunzipSync(Buffer.from(packed,'base64'));
const actual=createHash('sha256').update(source).digest('hex');
const expected={sha!r};
if(actual!==expected) throw new Error(`COREOS_ARTIFACT_HASH_MISMATCH:${{actual}}`);
await Bun.write('/tmp/coreos-runtime.ts',source);
console.log(JSON.stringify({{event:'COREOS_SELF_CONTAINED_ARTIFACT_VERIFIED',release:{version!r},build:{build!r},artifact_sha256:actual,bytes:source.length}}));
await import('file:///tmp/coreos-runtime.ts');
"""
out=root/'dist'/f'coreos-{version}.ts';out.parent.mkdir(exist_ok=True);out.write_text(wrapper)
(root/'dist'/f'coreos-{version}.sha256').write_text(hashlib.sha256(wrapper.encode()).hexdigest()+'  '+out.name+'\n')
print(version,build,sha,out)
