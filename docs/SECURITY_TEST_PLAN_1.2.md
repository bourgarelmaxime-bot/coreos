# CORE OS 1.2 — Security Negative Test Plan

Qualification must attempt: malformed descriptors, duplicate IDs, missing dependencies, cycles, negative/NaN costs, budget bypass, provider-interface mismatch, provider-capability mismatch, external mutation provider without authority, request-level external mutation without `mutation:authorize`, cross-application reads, idempotency replay conflict, oversized request, and forbidden domain coupling.

A security PASS requires fail-closed behavior for all applicable negative cases and no regression in the existing authentication/scope/application-isolation path.
