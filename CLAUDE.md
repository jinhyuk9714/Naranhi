# Naranhi — Project Rules

## Overview
Naranhi is an Immersive Translate-style Chrome extension for bilingual reading.
Multi-engine translation (DeepL, OpenAI, Google) with modern UI.

## Architecture
- **Monorepo**: pnpm workspace + Turborepo
- **Extension**: WXT + React + TypeScript + Tailwind CSS
- **Packages**: @naranhi/core, @naranhi/engines, @naranhi/ui, @naranhi/youtube
- **Proxy**: Node.js TypeScript server for DeepL API (CORS bypass)

## Directory Structure
```
packages/core/      — Shared types, constants, utilities
packages/engines/   — Translation engine abstraction (DeepL, OpenAI, Google)
packages/ui/        — Shared React components (Button, Toggle, Select, etc.)
packages/youtube/   — YouTube subtitle logic (ASR stabilizer, render policy)
apps/extension/     — WXT Chrome extension (popup, options, sidepanel, content scripts)
apps/proxy/         — DeepL proxy server (TypeScript)
_legacy/            — Previous plain JS implementation (reference only)
```

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

## Testing
- Framework: Vitest
- All engine implementations must have unit tests
- All utility functions must have tests
- Run: `pnpm test` or `vitest run`

## Commit Convention
- Format: `type(scope): description`
- Types: feat, fix, refactor, test, docs, chore
- Scopes: core, engines, extension, proxy, youtube, ui
