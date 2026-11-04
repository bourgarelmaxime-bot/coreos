// CORE OS MAX-03: falsifiable global policy candidate gate for SYNTHETIC ablations.
// This gate never authorizes production activation; empirical data must be verified
// separately by an evidence source / independent reviewer.
export type ComparativeVerdict=
 'REJECT_HARD_CONSTRAINT'|'REJECT_STATISTICAL_REGRESSION'|'INSUFFICIENT_EVIDENCE'|
 'VALUE_UNPROVEN'|'ELIGIBLE_FOR_SHADOW_REVIEW_ONLY';
export type ComparativeGate={
 verdict:ComparativeVerdict; eligible_for_shadow_review:boolean;
 eligible_for_production:boolean;scenarios:number;positive_scenarios:string[];
 regressions:string[];reason:string;source:'SEEDED_SYNTHETIC_ONLY';
};
const fail=(verdict:ComparativeVerdict,reason:string,scenarios=0,positive_scenarios:string[]=[],regressions:string[]=[]):ComparativeGate=>({
 verdict,eligible_for_shadow_review:false,eligible_for_production:false,scenarios,positive_scenarios,regressions,
 reason,source:'SEEDED_SYNTHETIC_ONLY'});
export function assessGlobalSyntheticPolicy(report:any,minSampleSize=100):ComparativeGate{
 if(report?.data?.provenance!=='SEEDED_SYNTHETIC_ONLY'||report?.data?.event!=='MAX03_ABLATION_REPORT')
  return fail('INSUFFICIENT_EVIDENCE','UNVERIFIED_SYNTHETIC_PROVENANCE');
 const scenarios=report.data.scenarios;
 if(!Array.isArray(scenarios)||scenarios.length<3)
  return fail('INSUFFICIENT_EVIDENCE','TOO_FEW_SCENARIOS');
 const names=new Set<string>(),positive:string[]=[],regressions:string[]=[];
 for(const trial of scenarios){
  const name=trial?.scenario,arms=trial?.arms,ci=trial?.paired_baseline_vs_adaptive?.bootstrap_95pct_CI;
  if(typeof name!=='string'||!name||names.has(name)||!Array.isArray(arms)||!Array.isArray(ci)||ci.length!==2)
   return fail('INSUFFICIENT_EVIDENCE','INVALID_SCENARIO_OR_DUPLICATE',scenarios.length);
  names.add(name);
  const baseline=arms.find((x:any)=>x?.strategy==='first_fit'),candidate=arms.find((x:any)=>x?.strategy==='adaptive');
  if(!baseline||!candidate||![...ci,baseline.success_rate,candidate.success_rate,baseline.modeled_cost,candidate.modeled_cost]
   .every(x=>typeof x==='number'&&Number.isFinite(x))||ci[0]>ci[1]||
   ![baseline.success_rate,candidate.success_rate].every(x=>x>=0&&x<=1))
   return fail('INSUFFICIENT_EVIDENCE','INVALID_MEASUREMENT',scenarios.length);
  const n=report.data.workloads_per_scenario;
  if(!Number.isInteger(n)||n<minSampleSize)return fail('INSUFFICIENT_EVIDENCE','SAMPLE_TOO_SMALL',scenarios.length);
  if(baseline.success_rate-candidate.success_rate>0.01)
   return fail('REJECT_HARD_CONSTRAINT','CANDIDATE_SUCCESS_INFERIOR',scenarios.length,positive,[name]);
  if(candidate.modeled_cost<0||baseline.modeled_cost<0)
   return fail('INSUFFICIENT_EVIDENCE','NEGATIVE_MODELED_COST',scenarios.length);
  if(ci[1]<0)regressions.push(name);
  if(ci[0]>0)positive.push(name);
 }
 if(regressions.length)return fail('REJECT_STATISTICAL_REGRESSION','COST_REGRESSION_IN_AT_LEAST_ONE_SCENARIO',
  scenarios.length,positive,regressions);
 if(positive.length===0)return fail('VALUE_UNPROVEN','NO_CONFIDENT_COMPARATIVE_IMPROVEMENT',
  scenarios.length,positive,regressions);
 return {verdict:'ELIGIBLE_FOR_SHADOW_REVIEW_ONLY',eligible_for_shadow_review:true,
  eligible_for_production:false,scenarios:scenarios.length,positive_scenarios:positive,
  regressions:[],reason:'SYNTHETIC_BENEFIT_NO_TESTED_REGRESSION_REQUIRES_INDEPENDENT_SHADOW_REVIEW',
  source:'SEEDED_SYNTHETIC_ONLY'};
}
