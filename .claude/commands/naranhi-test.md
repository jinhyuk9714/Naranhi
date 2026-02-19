Run tests, verify builds, and check code quality for the Naranhi project.

## Instructions

1. Run the full test suite:
   ```
   pnpm test
   ```

2. If any tests fail, investigate and fix the issues.

3. Run the full build to verify everything compiles:
   ```
   pnpm build
   ```

4. Check for TypeScript errors across all packages:
   - `pnpm --filter @naranhi/core build`
   - `pnpm --filter @naranhi/engines build`
   - `pnpm --filter @naranhi/youtube build`
   - `pnpm --filter @naranhi/ui build`
   - `pnpm --filter @naranhi/extension build`
   - `pnpm --filter @naranhi/proxy build`

5. Report a summary of:
   - Test results (pass/fail counts per package)
   - Build status per package
   - Any errors or warnings found

## Test locations
- `packages/core/__tests__/` — Core utilities (pipeline, batching, caching)
- `packages/youtube/__tests__/` — YouTube subtitle processing (ASR, render, dedup)
- `apps/proxy/__tests__/` — Proxy translate utilities (validation, CORS, error mapping)
