Add a new translation engine to the Naranhi project.

## Instructions

1. Read the TranslationEngine interface at `packages/engines/src/types.ts`
2. Read an existing engine implementation for reference (e.g., `packages/engines/src/deepl.ts`)
3. Create a new engine file at `packages/engines/src/<engine-name>.ts` implementing `TranslationEngine`
4. Export the new engine from `packages/engines/src/index.ts`
5. Add the engine type to `EngineType` in `packages/core/src/types/translation.ts`
6. Add default settings for the engine in `packages/core/src/types/settings.ts` under `NaranhiSettings`
7. Add default config values in `packages/core/src/constants.ts` under `DEFAULT_SETTINGS`
8. Register the engine in `packages/engines/src/manager.ts`
9. Write tests at `packages/engines/__tests__/<engine-name>.test.ts`
10. Run `pnpm --filter @naranhi/engines test` and `pnpm build` to verify

## Required TranslationEngine methods
- `translate(request)` — batch translate items, return TranslationResult[]
- `testConnection()` — return true if API is reachable
- `getUsage()` (optional) — return usage/quota info

## Security
- API keys must NEVER appear in client-side code
- If the engine needs a proxy, follow the DeepL proxy pattern in `apps/proxy/`
- Store API keys via chrome.storage only
