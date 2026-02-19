# Naranhi Proxy

This is a minimal local proxy that:
- adds CORS headers
- keeps your DeepL API key server-side
- forwards requests to DeepL `/v2/translate`

## Run
1) Create local env file:
```bash
cp .env.example .env
```

2) Put your key in `.env`:
```dotenv
DEEPL_AUTH_KEY=YOUR_KEY
DEEPL_API_BASE=https://api-free.deepl.com
PORT=8787
ALLOWED_ORIGINS=local
CACHE_TTL_MS=86400000
```

3) Start proxy:
```bash
node server.mjs
```

Then the proxy listens on http://localhost:8787.

`ALLOWED_ORIGINS` notes:
- `local` (default): allow only local browser/extension origins
- `*`: allow all origins (avoid unless you fully trust network boundary)
- `https://your-app.example,chrome-extension://<id>`: explicit allowlist

## Endpoints
- GET /health
- POST /translate

### POST /translate request
```json
{
  "items": [
    { "id": "a1", "text": "Hello world" }
  ],
  "target_lang": "KO",
  "source_lang": "EN",
  "options": {
    "preserve_formatting": true
  }
}
```

### POST /translate response
```json
{
  "translations": [
    { "id": "a1", "text": "안녕하세요 세계", "detected_source_language": "EN" }
  ],
  "meta": { "cache": "MISS", "provider": "deepl" }
}
```

### Error response
```json
{
  "error": {
    "code": "DEEPL_AUTH",
    "message": "Authorization failed",
    "retryable": false
  }
}
```
