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

## v1 candidate (current)

### Done in codebase
- Core UX: page toggle stability, readability-safe rendering, selection translate, failure recovery banner
- Translation pipeline: visible-only progressive translation, long paragraph split/merge stability, cache/inflight dedupe, DeepL retry/backoff defense
- YouTube subtitle: watch-page-only toggle, ASR duplicate suppression, seek/pause/resume-safe render, no-caption/permission messaging
- Settings & state: unified storage mapping, popup/sidepanel/content sync, strict option validation, client secret non-persistence
- Quality gates: lint/test/build green + manual verification snapshot documented

### Remaining before final store release
- per-site rules
- per-language profiles
- release packaging/publishing polish

## v1.1+
- document translation (PDF/SRT/etc)
- glossary support
- cloud-hosted proxy + BYOK/billing model
