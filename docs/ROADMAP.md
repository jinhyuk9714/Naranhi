# Roadmap

## v0.1
- bilingual page translation (basic blocks)
- selection translate
- local proxy + caching

## v0.2
- smarter content detection (Readability) - implemented
- translate visible-only (IntersectionObserver) - implemented
- subtitle translation for YouTube (caption track) - implemented (desktop watch)
- subtitle stabilization for YouTube auto-captions (hook-first + fallback) - implemented (v0.2.2)
- subtitle quality parity tuning (manual merge + DeepL preset/context + anti-flicker + optional AI splitter) - implemented (v0.2.3)

### v0.2 checklist
- [x] Readability/legacy extraction mode switch
- [x] visible-only incremental queue with observer
- [x] options for extraction mode + visible-only tuning
- [x] YouTube subtitle translation
- [x] YouTube subtitle quality parity tuning (v0.2.3)

## v0.3
- document translation (PDF/SRT/etc) via DeepL Document API
- glossary support
- cloud-hosted proxy + per-user keys (BYOK) or billing

## v1
- per-site rules
- per-language profiles
- UX polish + store release
