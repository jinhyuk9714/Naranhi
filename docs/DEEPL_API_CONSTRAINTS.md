# DeepL API constraints you MUST design around

## 1) No browser calls (CORS)
DeepL API requests from browser-based apps are blocked by CORS, and exposing API keys in client-side code is unsafe.
=> Use a proxy/backend.

## 2) Use POST + Authorization header
Do not send API keys in query parameters.
Use `Authorization: DeepL-Auth-Key ...` header.

## 3) API Free quotas & limits
- 500,000 characters/month on API Free
- Request size limits (header + body)
- Document API has separate upload limits and billing rules

## 4) HTML tag handling
DeepL can translate HTML if you pass `tag_handling=html` and optional `tag_handling_version=v2`.
For v0.1, we translate plain text extracted from the DOM.

## 5) Chunking strategy
- Keep chunks small to avoid request-size errors
- Keep per-request string count reasonable
