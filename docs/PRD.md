# PRD — DualRead

## One-liner
A browser extension that turns foreign-language web pages into **bilingual pages** (original + DeepL translation), optimized for reading.

## Target users
- language learners
- developers/researchers reading foreign documentation
- people who want “original + translation” instead of replacing the page

## MVP (v0.1)
### Core 1) Bilingual page translation
- User clicks extension → “Translate Page”
- Extension detects readable blocks (p, headings, list items, blockquote)
- Injects translation under original text
- Toggle off removes injected translation

### Core 2) Translate selection
- Right click selected text → “Translate with Naranhi”
- Shows a floating tooltip with translated text
- Keyboard shortcut (later)

### Settings (v0.1)
- Target language (default: KO)
- Source language: auto or fixed (optional)
- Proxy URL (default: http://localhost:8787)
- Formality (optional, later)
- Cache: on/off + clear cache

## Out of scope (v0.1)
- Video subtitle translation (v0.2+)
- PDF/document translation (v0.3+)
- Multi-engine (DeepL only for now)
- Cloud accounts/billing

## Success metrics
- 3-click onboarding: install → set proxy url → translate page
- Page translation works on 80%+ of simple article pages
- Noticeable cost savings from caching on revisits
