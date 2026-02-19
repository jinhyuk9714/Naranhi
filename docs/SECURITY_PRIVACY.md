# Security & Privacy

## Data sensitivity
Web page text may include:
- personal data
- confidential company info
Treat everything as sensitive.

## Key rules
- DeepL API key must live only on the proxy (server-side).
- Optional AI splitter key (`AI_SPLITTER_API_KEY`) must also live only on the proxy.
- Never commit keys to git.
- Extension stores only user settings and optional cached translations (`cacheEnabled` opt-in).

## Defaults
- No telemetry
- No analytics
- Persistent cache OFF by default, user can enable/disable and clear it.

## Threats
- Key leakage (client-side code)
- Proxy exposed to the internet without auth
- Logging of sensitive text
- Persistent local cache retaining sensitive text longer than intended

## Mitigations
- local proxy by default
- CORS defaults to `ALLOWED_ORIGINS=local` (local + extension origins only)
- when hosted, use explicit allowlist for `ALLOWED_ORIGINS` (avoid `*`)
- sanitize logs (status/error code only; no raw source text)
- structured error schema with retryability (`{ code, message, retryable }`)
- cache eviction + TTL for in-memory and local cache entries
- proxy validates `Content-Type: application/json` for `/translate`

## Changelog
- v0.1: proxy `/translate` error responses now use structured codes (`DEEPL_AUTH`, `DEEPL_QUOTA`, `DEEPL_RATE_LIMIT`, etc.).
- v0.1: extension moved from blocking alerts to inline banner errors to avoid leaking payloads in dialogs/logs.
- v0.1: cache control is explicit opt-in with clear-cache action in options page.
- v0.1: CORS policy hardened from permissive default to `local` default.
- v0.2.3: added optional proxy-only AI sentence splitter (`/segment`) with feature flag default OFF.
