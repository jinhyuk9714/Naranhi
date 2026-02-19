/**
 * Content Script entry point — listens for messages and orchestrates page translation.
 */

import { MESSAGE_TYPES } from '@naranhi/core';
import { PageTranslator } from './translator';
import { showTooltip, showBanner, removeTooltip } from './dom-injector';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  main() {
    const translator = new PageTranslator();

    // Listen for messages from background / popup
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.type === MESSAGE_TYPES.TOGGLE_PAGE) {
        translator.toggle();
        sendResponse({ ok: true, data: { enabled: translator.isEnabled() } });
        return;
      }

      if (msg?.type === MESSAGE_TYPES.GET_PAGE_STATE) {
        sendResponse({ ok: true, data: { enabled: translator.isEnabled() } });
        return;
      }

      if (msg?.type === MESSAGE_TYPES.SHOW_TOOLTIP) {
        showTooltip(msg.translatedText);
        sendResponse({ ok: true });
        return;
      }

      if (msg?.type === MESSAGE_TYPES.SHOW_BANNER) {
        showBanner(msg.message, msg.retryable);
        sendResponse({ ok: true });
        return;
      }
    });

    // Remove tooltip on click elsewhere
    document.addEventListener('click', () => removeTooltip(), { passive: true });
  },
});
