from pathlib import Path
import hashlib
root=Path(__file__).resolve().parents[1]
parts=sorted((root/'src').glob('runtime.part*.ts'))
data=b''.join(p.read_bytes() for p in parts)
out=root/'src/runtime.ts'
out.write_bytes(data)
print(out, hashlib.sha256(data).hexdigest())
