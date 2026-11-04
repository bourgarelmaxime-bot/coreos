#!/usr/bin/env python3
"""Summarize the exact SARIF emitted by independent CodeQL security-extended scan."""
import json
import os
import hashlib
from pathlib import Path

candidates = [Path("../results/javascript.sarif"), Path("results/javascript.sarif")]
candidate = next((p for p in candidates if p.is_file()), None)
if candidate is None:
    raise SystemExit("MAX04_CODEQL_SARIF_MISSING")
data = candidate.read_bytes()
report = json.loads(data)
all_findings = []
diagnostics = []
for run in report.get("runs", []):
    rules = {r.get("id"): r for r in run.get("tool", {}).get("driver", {}).get("rules", [])}
    for finding in run.get("results", []):
        rule_id = finding.get("ruleId", "")
        level = finding.get("level") or rules.get(rule_id, {}).get("defaultConfiguration", {}).get("level") or "warning"
        locs = finding.get("locations", [])
        line = (locs[0].get("physicalLocation") if locs else {}) or {}
        location = line.get("artifactLocation", {}).get("uri", "")
        record = {
            "rule_id": rule_id,
            "severity": level,
            "location": location,
            "line": line.get("region", {}).get("startLine"),
            "message": (finding.get("message", {}).get("text", ""))[:250]
        }
        if rule_id.startswith("js/diagnostics/"):
            diagnostics.append(record)
        else:
            all_findings.append(record)
severities = {level: sum(f["severity"] == level for f in all_findings) for level in ("error", "warning", "note")}
summary = {
    "event": "MAX04_CODEQL_SECURITY_EXTENDED_REPORT",
    "sarif_sha256": hashlib.sha256(data).hexdigest(),
    "tool": "CodeQL JavaScript/TypeScript security-extended",
    "finding_count": len(all_findings),
    "severity_counts": severities,
    "diagnostics": diagnostics[:20],
    "findings": all_findings[:50]
}
print(json.dumps(summary, separators=(",", ":")))
Path("max04-codeql-summary.json").write_text(json.dumps(summary, indent=2) + "\n")
if any("extract" in r["rule_id"] and ("error" in r["message"].lower() or "syntax" in r["message"].lower()) for r in diagnostics):
    raise SystemExit("MAX04_CODEQL_EXTRACTION_ERRORS")
if severities["error"]:
    raise SystemExit("MAX04_CODEQL_HIGH_SEVERITY_FINDINGS")
