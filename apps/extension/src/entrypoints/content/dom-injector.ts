/**
 * DOM Injector — injects and removes bilingual translation nodes.
 */

const TRANSLATION_CLASS = 'naranhi-translation';
const TRANSLATION_ATTR = 'data-naranhi-for';
const BLOCK_ID_ATTR = 'data-naranhi-id';
const MIN_TEXT_LENGTH = 20;

const BLOCK_SELECTORS = 'p, li, blockquote, h1, h2, h3, h4, h5, h6, td, th, dd, dt, figcaption';

/**
 * Inject CSS styles for translation blocks.
 */
export function injectStyles(): void {
  if (document.getElementById('naranhi-content-styles')) return;

  const style = document.createElement('style');
  style.id = 'naranhi-content-styles';
  style.textContent = `
    .${TRANSLATION_CLASS} {
      margin-top: 6px;
      font-size: 0.95em;
      opacity: 0.88;
      border-left: 3px solid rgba(0, 0, 0, 0.15);
      padding-left: 10px;
      color: inherit;
      line-height: 1.6;
      white-space: pre-wrap;
    }
    @media (prefers-color-scheme: dark) {
      .${TRANSLATION_CLASS} {
        border-left-color: rgba(255, 255, 255, 0.2);
      }
    }
    .naranhi-tooltip {
      position: absolute;
      z-index: 2147483647;
      max-width: 360px;
      padding: 10px 14px;
      background: #111;
      color: #fff;
      font-size: 14px;
      line-height: 1.5;
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.25);
      white-space: pre-wrap;
      pointer-events: none;
    }
    .naranhi-banner {
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 2147483647;
      max-width: 380px;
      padding: 12px 16px;
      background: #fff5f5;
      color: #7a1c1c;
      border: 1px solid #f2bbbb;
      border-radius: 8px;
      font-size: 13px;
      line-height: 1.5;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }
  `;
  document.head.appendChild(style);
}

/**
 * Find all translatable block elements within a container.
 */
export function findTranslatableBlocks(container: Element): HTMLElement[] {
  const blocks: HTMLElement[] = [];
  const elements = container.querySelectorAll(BLOCK_SELECTORS);

  for (const el of elements) {
    const htmlEl = el as HTMLElement;
    // Skip if already has a naranhi id
    if (htmlEl.getAttribute(BLOCK_ID_ATTR)) continue;
    // Skip short text
    const text = (htmlEl.innerText || htmlEl.textContent || '').replace(/\s+/g, ' ').trim();
    if (text.length < MIN_TEXT_LENGTH) continue;
    // Skip nested translation nodes
    if (htmlEl.classList.contains(TRANSLATION_CLASS)) continue;

    blocks.push(htmlEl);
  }

  return blocks;
}

/**
 * Assign unique IDs to block elements and return them as items.
 */
export function assignBlockIds(blocks: HTMLElement[]): Array<{ id: string; text: string; el: HTMLElement }> {
  const items: Array<{ id: string; text: string; el: HTMLElement }> = [];
  let counter = 0;

  for (const block of blocks) {
    let id = block.getAttribute(BLOCK_ID_ATTR);
    if (!id) {
      id = `naranhi-${Date.now()}-${counter++}`;
      block.setAttribute(BLOCK_ID_ATTR, id);
    }

    const text = (block.innerText || block.textContent || '').replace(/\s+/g, ' ').trim();
    if (text.length >= MIN_TEXT_LENGTH) {
      items.push({ id, text, el: block });
    }
  }

  return items;
}

/**
 * Inject a translation node after the original block.
 */
export function injectTranslation(blockId: string, translatedText: string): void {
  // Remove existing translation for this block
  removeTranslation(blockId);

  const original = document.querySelector(`[${BLOCK_ID_ATTR}="${blockId}"]`);
  if (!original) return;

  const translationDiv = document.createElement('div');
  translationDiv.className = TRANSLATION_CLASS;
  translationDiv.setAttribute(TRANSLATION_ATTR, blockId);
  translationDiv.textContent = translatedText;

  original.insertAdjacentElement('afterend', translationDiv);
}

/**
 * Remove a translation node for a specific block.
 */
export function removeTranslation(blockId: string): void {
  const existing = document.querySelector(`[${TRANSLATION_ATTR}="${blockId}"]`);
  existing?.remove();
}

/**
 * Remove ALL translation nodes from the page.
 */
export function removeAllTranslations(): void {
  const nodes = document.querySelectorAll(`.${TRANSLATION_CLASS}`);
  for (const node of nodes) {
    node.remove();
  }

  // Also remove block IDs
  const blocks = document.querySelectorAll(`[${BLOCK_ID_ATTR}]`);
  for (const block of blocks) {
    block.removeAttribute(BLOCK_ID_ATTR);
  }
}

/**
 * Show a floating tooltip near the selection.
 */
export function showTooltip(translatedText: string): void {
  removeTooltip();

  const selection = window.getSelection();
  if (!selection?.rangeCount) return;

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  const tooltip = document.createElement('div');
  tooltip.className = 'naranhi-tooltip';
  tooltip.id = 'naranhi-tooltip';
  tooltip.textContent = translatedText;
  tooltip.style.top = `${window.scrollY + rect.bottom + 8}px`;
  tooltip.style.left = `${window.scrollX + rect.left}px`;

  document.body.appendChild(tooltip);

  // Auto-remove after 6s
  setTimeout(removeTooltip, 6000);
}

/**
 * Remove the floating tooltip.
 */
export function removeTooltip(): void {
  document.getElementById('naranhi-tooltip')?.remove();
}

/**
 * Show an error banner at the top-right.
 */
export function showBanner(message: string, retryable: boolean, onRetry?: () => void): void {
  removeBanner();

  const banner = document.createElement('div');
  banner.className = 'naranhi-banner';
  banner.id = 'naranhi-banner';

  const text = document.createElement('span');
  text.textContent = message;
  banner.appendChild(text);

  if (retryable && onRetry) {
    const btn = document.createElement('button');
    btn.textContent = 'Retry';
    btn.style.cssText = 'margin-left:12px;padding:2px 8px;border:1px solid #7a1c1c;border-radius:4px;background:transparent;color:#7a1c1c;cursor:pointer;';
    btn.addEventListener('click', () => {
      removeBanner();
      onRetry();
    });
    banner.appendChild(btn);
  }

  const close = document.createElement('button');
  close.textContent = '\u00d7';
  close.style.cssText = 'margin-left:8px;border:none;background:transparent;color:#7a1c1c;cursor:pointer;font-size:16px;';
  close.addEventListener('click', removeBanner);
  banner.appendChild(close);

  document.body.appendChild(banner);
  setTimeout(removeBanner, 8000);
}

/**
 * Remove the error banner.
 */
export function removeBanner(): void {
  document.getElementById('naranhi-banner')?.remove();
}
