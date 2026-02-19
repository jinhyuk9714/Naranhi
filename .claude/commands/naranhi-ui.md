Create or modify a UI component for the Naranhi Chrome extension.

## Instructions

1. Read existing components for style reference:
   - `packages/ui/src/components/Button.tsx` — variant/size pattern
   - `packages/ui/src/components/Toggle.tsx` — switch pattern
   - `packages/ui/src/components/Select.tsx` — dropdown pattern

2. Determine where the component belongs:
   - **Shared** → `packages/ui/src/components/` (reused across popup, options, sidepanel)
   - **Extension-specific** → `apps/extension/src/entrypoints/<page>/components/`

3. Follow these conventions:
   - React functional components + hooks only
   - Use Tailwind CSS for styling
   - Use naranhi color palette: `naranhi-50` through `naranhi-900`, primary is `naranhi-500`
   - Export from the package index if it's a shared component
   - PascalCase for file names (`LanguageSelector.tsx`)
   - Include TypeScript props interface

4. For Content Script UI (floating button, tooltips):
   - Use inline styles or Shadow DOM-scoped styles
   - Never rely on external CSS that could conflict with host page
   - Use WXT's `createShadowRootUi` for isolation

5. Build and verify:
   ```
   pnpm build
   ```

## Color palette (Tailwind custom)
- `naranhi-50: #fff7ed` to `naranhi-900: #7c2d12`
- Primary: `naranhi-500: #f97316` (orange)

## Accessibility checklist
- Use semantic HTML elements
- Include aria-labels for icon-only buttons
- Ensure sufficient color contrast
- Support keyboard navigation (tabIndex, onKeyDown)
