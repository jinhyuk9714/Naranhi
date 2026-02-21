# Naranhi — Immersive bilingual web/page translator (v1 candidate)

Naranhi is a Chrome/Edge MV3 extension for immersive reading:
- page bilingual translation (original + translated)
- selection translation (context menu)
- YouTube subtitle bilingual overlay with ASR stabilization

DeepL/OpenAI/Google translation is routed through the project proxy/engine layer.

## Current v1 candidate scope

### Implemented
- Page translation toggle (stable ON/OFF rollback)
- Readability-aware block extraction + safe DOM injection policy
- Visible-only incremental translation queue (IntersectionObserver + fallback)
- Translation retry banner for recoverable failures
- Selection translate from context menu on major sites
- Cache dedupe (memory/local + in-flight dedupe)
- DeepL limit defense (429/5xx retry, Retry-After/backoff)
- YouTube subtitle toggle only on watch pages
- YouTube no-caption/permission error messaging
- ASR retranslation/flicker suppression and seek/pause/resume-safe rendering
- Settings synchronization across popup/sidepanel/content
- Client-side secret key storage blocked (backend-only secret policy)

### Known limits
- Per-site rules and per-language profiles are not included in this candidate
- Document translation (PDF/SRT upload flow) is out of scope for this release
- Cloud proxy deployment/BYOK billing flow is not bundled

## Setup

### 1) Install
```bash
pnpm install
```

### 2) Run proxy
```bash
cd apps/proxy
DEEPL_AUTH_KEY="YOUR_KEY" pnpm dev
```

(DeepL Pro users can set `DEEPL_API_BASE=https://api.deepl.com`.)

### 3) Build extension
```bash
cd /Users/sungjh/Naranhi
pnpm --filter @naranhi/extension build
```

Load unpacked from:
- `apps/extension/.output/chrome-mv3`

### 4) Configure
- Extension → Settings → DeepL proxy URL
- Default local: `http://localhost:8787`

## Demo scenarios
- Wikipedia article: page toggle ON/OFF and visible-only progressive translation
- Blog/news page: selection translate via context menu
- YouTube watch page: subtitle toggle, no-caption 안내 문구, seek/pause/resume stability

## Validation
```bash
pnpm lint
pnpm test
pnpm build
```

See `docs/TESTING.md` for the latest v1 candidate verification snapshot.
