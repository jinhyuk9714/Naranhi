# DualRead — DeepL-powered “Immersive Translate”-style extension (Codex Starter Kit)

Build a browser extension that shows **bilingual web pages** (original + translation), powered by **DeepL API**.

> ⚠️ Important: DeepL API **cannot be called directly from browser code** due to CORS + key exposure concerns.
> This kit includes a tiny **local proxy server** that keeps your DeepL key secret and adds CORS headers.

## What’s included
- `AGENTS.md` — Codex working agreement (source of truth)
- `.codex/config.toml` — project Codex config (safe defaults)
- `.agents/skills/*` — reusable Codex skills
- `docs/` — PRD, architecture, DeepL constraints, prompt library
- `apps/extension/` — minimal Chrome/Edge extension (Manifest V3)
- `apps/proxy/` — minimal Node proxy server (no dependencies)

## Quick start (local)
### 0) Prereqs
- Node.js 18+ (or 20+)

### 1) Get a DeepL API key
Create a DeepL API account (Free or Pro) and obtain an auth key.

### 2) Start the proxy
```bash
cd apps/proxy
DEEPL_AUTH_KEY="YOUR_KEY" \
DEEPL_API_BASE="https://api-free.deepl.com" \
node server.mjs
```

If you use DeepL API Pro, set:
- `DEEPL_API_BASE="https://api.deepl.com"`

### 3) Load the extension
1. Open Chrome → `chrome://extensions`
2. Enable Developer mode
3. “Load unpacked” → select `apps/extension`

### 4) Configure extension
Click extension → Settings → set Proxy URL to:
- `http://localhost:8787`

## MVP features (v0.1)
- Toggle **bilingual page translation**
- Translate selection (context menu)
- Basic batching + local caching

## Not affiliated
This project is **not affiliated** with DeepL or Immersive Translate.
