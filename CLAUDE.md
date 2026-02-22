# Naranhi — Project Rules

## Overview
Naranhi is an Immersive Translate-style Chrome extension for bilingual reading.
Multi-engine translation (DeepL, OpenAI, Google) with modern UI.
YouTube 자막 이중 번역 지원 (ASR + 수동 자막).

## Architecture
- **Monorepo**: pnpm workspace + Turborepo
- **Extension**: WXT 0.20 + React + TypeScript + Tailwind CSS
- **Packages**: @naranhi/core, @naranhi/engines, @naranhi/ui, @naranhi/youtube
- **Proxy**: Node.js TypeScript server for DeepL API (CORS bypass)

## Directory Structure
```
packages/core/      — Shared types, constants, utilities
packages/engines/   — Translation engine abstraction (DeepL, OpenAI, Google)
packages/ui/        — Shared React components (Button, Toggle, Select, etc.)
packages/youtube/   — YouTube subtitle logic (ASR stabilizer, render policy, hook bridge)
apps/extension/     — WXT Chrome extension (popup, options, sidepanel, content scripts)
apps/proxy/         — DeepL proxy server (TypeScript)
_legacy/            — Previous plain JS implementation (reference only)
```

## Key Content Scripts
- `content/index.ts` — 페이지 번역 + YouTube 자막 메시지 핸들링
- `youtube-hook.content.ts` — MAIN world, fetch/XHR 인터셉트 (timedtext API)
- `content/youtube-subtitle-handler.ts` — 자막 번역 오케스트레이터 (커스텀 오버레이)
- `floating.content/` — 선택 번역 팝업 UI

## Commands
- `pnpm dev` — Start all dev servers (extension HMR + proxy)
- `pnpm build` — Production build
- `pnpm test` — Run all tests (Vitest)
- `pnpm lint` — Run ESLint
- `pnpm --filter @naranhi/extension dev` — Extension only
- `pnpm --filter @naranhi/proxy dev` — Proxy only

## Coding Conventions
- TypeScript strict mode everywhere
- React: functional components + hooks only
- State management: zustand
- Styling: Tailwind CSS
- File naming: kebab-case (`asr-stabilizer.ts`)
- Component naming: PascalCase (`LanguageSelector.tsx`)
- Variables/functions: camelCase
- 한국어 커밋 메시지 OK, but scope는 영어

## Security Rules (NON-NEGOTIABLE)
- NEVER expose API keys in client-side code (extension/content scripts)
- DeepL calls MUST go through the proxy server
- OpenAI/Google API keys stored in chrome.storage, never logged
- No raw text payloads in logs
- Cache is opt-in (default OFF)

## Translation Engine Pattern
To add a new engine, implement `TranslationEngine` interface in `packages/engines/src/`:
```typescript
interface TranslationEngine {
  id: EngineType;
  name: string;
  translate(request: TranslationRequest): Promise<TranslationResult[]>;
  testConnection(): Promise<boolean>;
}
```

## YouTube Subtitle Architecture
```
Hook Bridge (MAIN world) → postMessage → Subtitle Handler (ISOLATED world)
  ↓ timedtext API 인터셉트         ↓ ASR Stabilizer로 문장 분리
                                   ↓ 배치 번역 (background service worker)
                                   ↓ 커스텀 오버레이 렌더링 (setInterval polling)
```
- 네이티브 YouTube 자막은 CSS로 숨기고, 커스텀 오버레이에 원문+번역 동시 표시
- `selectActiveCue()` — 시간 기반 cue 매칭
- `resolveRenderText()` — 900ms anti-flicker hold
- DOM 폴백: hook 실패 시 MutationObserver로 텍스트 추출 (렌더링은 커스텀 오버레이)

## Testing
- Framework: Vitest
- All engine implementations must have unit tests
- All utility functions must have tests
- Run: `pnpm test` or `vitest run`

## Commit Convention
- Format: `type(scope): description`
- Types: feat, fix, refactor, test, docs, chore
- Scopes: core, engines, extension, proxy, youtube, ui
