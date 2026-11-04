// Explicitly offline CLI for evidence-falsification; does not start CORE OS HTTP server.
// Reads one small JSON request on stdin and returns a non-actionable shadow decision.
import {shadowRankProviders} from '../src/shadow-provider-ranking.ts';
try {
 const raw=await Bun.stdin.text();
 if(raw.length>65536)throw new Error('P2_INPUT_TOO_LARGE');
 const input=JSON.parse(raw);
 const result=shadowRankProviders(input);
 if(result.actionable!==false||result.can_execute!==false||result.can_promote!==false)
   throw new Error('P2_SHADOW_AUTHORITY_VIOLATION');
 process.stdout.write(JSON.stringify(result)+'\n');
}catch(error:any){
 process.stderr.write(JSON.stringify({event:'COREOS_P2_SHADOW_CLI_REJECTED',reason:String(error?.code||error?.message||'INVALID')})+'\n');
 process.exitCode=2;
}
