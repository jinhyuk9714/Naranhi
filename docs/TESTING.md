# Testing

## Manual test matrix (v0.2.3)
Sites:
- Wikipedia article
- Medium-like blog
- News article

Checks:
- Toggle translation on/off
- No layout breakage (basic)
- Selection translate tooltip (`Translate with Naranhi`) on major sites (Wikipedia / Medium-style blog / news) and error banner fallback on forced proxy failure
- Visible-only mode: initial viewport translated first, scroll loads additional blocks
- `visibleOnly=false` fallback: full-scan translation works like v0.1
- `extractionMode=readability` vs `legacy` both produce translatable blocks
- Proxy down -> inline banner + retry shown
- Quota exceeded -> clear non-retryable error shown
- Toggle off removes all injected translation nodes (`data-dualread-for`)
- Cache disabled/enabled behavior matches options setting
- 엔진 설정 화면에 API key 입력 필드가 없고, 비밀키는 클라이언트 저장소(sync/local)에 저장되지 않음
- Clear cache button clears local cache and background memory cache
- Proxy returns `415 BAD_REQUEST` for non-JSON `Content-Type`
- YouTube watch + manual/auto captions: subtitle toggle ON injects bilingual subtitle line
- YouTube auto captions: word-by-word updates do not trigger translation spam
- YouTube seek/pause/resume does not cause repeated translation spam
- YouTube manual captions: short adjacent lines merge into sentence-level translation where appropriate
- YouTube subtitle toggle state remains synced after popup reopen
- YouTube non-watch page: subtitle toggle disabled + 안내 문구 표시
- No-caption video: `No captions detected on this video.` 안내 문구 shown
- Caption permission/region 제한 영상: 권한 제한 안내 문구 shown
- Hook unavailable case: DOM fallback still shows subtitle translations
- Subtitle render anti-flicker: temporary miss keeps previous translated line briefly, then hides
- Proxy `/segment` disabled (default): subtitle flow still works with heuristic-only split
- Proxy `/segment` enabled: low-confidence English ASR windows can refine sentence boundaries without blocking playback
- User report video `https://www.youtube.com/watch?v=Ce1x-yS1Jpo&t=2128s`: stable translation behavior

## Unit tests
Run:
```bash
node --test tests/*.test.mjs
```

Coverage:
- chunking function honors item/char/body-byte limits
- long text split/join preserves normalized order
- cache key stability + dedupe key equivalence
- proxy payload normalization and options filtering
- DeepL status -> internal error code mapping
- CORS origin resolution (`local`, explicit allowlist, wildcard)
- `Content-Type` JSON detection helper
- visible queue dedupe and state transitions (queued/inflight/translated)
- content detection candidate selection + heuristic fallback
- youtube subtitle caption normalization/dedupe/flush queue behavior
- youtube ASR stabilizer split/merge and deterministic cue-id generation
- youtube ASR low-confidence detection and manual caption sentence merger
- youtube render policy (`time+text` cue selection and hold-last-text behavior)
- DOM fallback commit policy (`700ms`/`1800ms`) and dedupe TTL
- active cue selection by `video.currentTime`

## Latest verification snapshot (v1 candidate)
- Date/round: 2026-02-21, OpenClaw 2-bot loop R2
- Automated gates:
  - `pnpm lint` ✅
  - `pnpm test` ✅
  - `pnpm build` ✅
- Manual checklist pass summary:
  - Core page translation toggle/rollback/visible-only flows ✅
  - Context menu selection translate on Wikipedia/blog/news + fallback banner ✅
  - YouTube watch-only toggle gating + no-caption/permission notice messaging ✅
  - YouTube ASR duplicate suppression + pause/seek/resume anti-flicker behavior ✅
  - Settings sync/validation/secret non-exposure policy checks ✅

## Changelog
- v0.1: added runnable unit tests under `tests/`.
- v0.1: manual matrix expanded for cache controls and inline banner UX.
- v0.1: added hardening checks for CORS policy and content-type validation.
- v0.2: added visible-only and extraction-mode test scenarios.
- v0.2.1: added YouTube subtitle bilingual-overlay scenarios and helper unit tests.
- v0.2.2: added YouTube hook-first stabilization and DOM fallback test coverage.
- v0.2.3: added sentence-merger, low-confidence ASR, render hold, and subtitle preset validation scenarios.
- v1-candidate: quality gate run + full manual matrix snapshot added.
