# Naranhi v1 Candidate — Release Notes

## Summary
This candidate brings Naranhi to immersive-translate-level core behavior for page reading and YouTube subtitle workflows, with reliability and safety hardening.

## Highlights

### Core UX
- Stable page translation ON/OFF with rollback-safe state handling
- Layout-safe bilingual injection policy for structure-sensitive DOM
- Selection translate via context menu on major sites
- Recoverable translation failure banner with retry path

### Translation Pipeline
- Visible-only progressive translation with observer fallback
- Long-paragraph chunk split/merge stability improvements
- Duplicate translation minimization via cache + in-flight dedupe
- DeepL limit/error defense with Retry-After + backoff strategy

### YouTube Subtitle
- Subtitle toggle enabled only on YouTube watch pages
- Clear user-facing notices for no-caption and permission-restricted videos
- Playback-aware rendering for seek/pause/resume stability
- ASR duplicate suppression to reduce retranslation/flicker
- Error-code ↔ user-message contract tests added (`NOT_WATCH_PAGE` / `NO_CAPTIONS` / `CAPTION_PERMISSION_DENIED`)
- Popup-level toggle sync test added (watch page ON/OFF response and reopen-state sync)

### Settings & Security
- Unified settings mapping across popup/options/sidepanel/background
- Real-time cross-surface settings/page-state sync
- Strict settings boundary validation (URL/options/range)
- Client-side secret persistence blocked (backend-only secret policy)

## Verification Snapshot
- `pnpm lint`: pass
- `pnpm test`: pass
- `pnpm build`: pass
- Manual scenarios: see `docs/TESTING.md` latest v1 candidate snapshot

## Known Gaps
- Per-site rules / per-language profiles are not included in this candidate
- Document translation flow (PDF/SRT upload) is out of current scope

## Upgrade Notes
- If legacy API keys were ever stored in extension sync storage, current startup path removes those keys.
- Provider credentials should be configured on the proxy/backend only.
