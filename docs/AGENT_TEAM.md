# Multi-agent workflow (practical)

Use multiple Codex threads:

1) Spec agent
- tighten MVP acceptance criteria
- use $dualread-spec

2) Extension agent
- DOM extraction + injection + UX
- use $dualread-extension

3) Proxy agent
- security + caching + limits
- can be done in extension thread or separate

4) QA/Security agent
- privacy review + test matrix
- use $dualread-review
