import {test,expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import {assessGlobalSyntheticPolicy} from '../../src/policy-qualification.ts';
const verified=()=>JSON.parse(readFileSync('MAX03_POLICY_ABLATION_RESULTS.json','utf8'));
test('actual seeded four-regime evidence REJECTS global policy due to stable regression',()=>{
 const r=assessGlobalSyntheticPolicy(verified());
 expect(r.verdict).toBe('REJECT_STATISTICAL_REGRESSION');
 expect(r.regressions).toContain('stable');
 expect(r.positive_scenarios).toContain('preferred_degraded');
 expect(r.eligible_for_shadow_review).toBe(false);
 expect(r.eligible_for_production).toBe(false);
});
test('global policy gate rejects unverifiable provenance',()=>{
 const input=verified();input.data.provenance='SELF_REPORTED';
 expect(assessGlobalSyntheticPolicy(input).verdict).toBe('INSUFFICIENT_EVIDENCE');
});
test('global policy gate rejects selective omission of adverse scenarios',()=>{
 const input=verified();input.data.scenarios=input.data.scenarios.slice(0,1);
 expect(assessGlobalSyntheticPolicy(input).verdict).toBe('INSUFFICIENT_EVIDENCE');
});
test('global policy gate refuses low sample evidence and success inferiority',()=>{
 const input=verified();input.data.workloads_per_scenario=12;
 expect(assessGlobalSyntheticPolicy(input).verdict).toBe('INSUFFICIENT_EVIDENCE');
 input.data.workloads_per_scenario=200;
 input.data.scenarios[0].arms.find((a:any)=>a.strategy==='adaptive').success_rate=.5;
 expect(assessGlobalSyntheticPolicy(input).verdict).toBe('REJECT_HARD_CONSTRAINT');
});
test('global policy gate never grants production activation, even if evidence seems favorable',()=>{
 const input=verified();
 for(const s of input.data.scenarios){
  s.paired_baseline_vs_adaptive.bootstrap_95pct_CI=[.02,.16];
  const baseline=s.arms.find((a:any)=>a.strategy==='first_fit');
  const adaptive=s.arms.find((a:any)=>a.strategy==='adaptive');
  adaptive.success_rate=baseline.success_rate;
 }
 const r=assessGlobalSyntheticPolicy(input);
 expect(r.verdict).toBe('ELIGIBLE_FOR_SHADOW_REVIEW_ONLY');
 expect(r.eligible_for_shadow_review).toBe(true);
 expect(r.eligible_for_production).toBe(false);
});
