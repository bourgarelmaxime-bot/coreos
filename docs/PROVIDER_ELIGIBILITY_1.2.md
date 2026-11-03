# CORE OS 1.2 — Provider Eligibility

Provider matching is structural and fail-closed. A capability may require one or more provider interfaces and opaque provider capability labels. An eligible provider must satisfy the declared interface constraint and all declared capability labels.

Provider matching does not establish provider truth, health or trust. Those remain future runtime concerns. A provider declaring an external mutation surface is excluded unless the request authority allows external mutation; request submission separately requires the existing `mutation:authorize` scope before such authority is accepted.

No provider requirement means no provider assignment is required for planning compatibility with legacy capabilities.
