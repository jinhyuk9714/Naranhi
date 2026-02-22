/**
 * Content Script entry point — listens for messages and orchestrates page translation.
 */

import { MESSAGE_TYPES } from '@naranhi/core';
import { PageTranslator } from './translator';
import { showTooltip, showBanner, removeTooltip } from './dom-injector';
import { createYouTubeSubtitleController } from './youtube-subtitle-controller';
import { createYouTubeSubtitleHandler } from './youtube-subtitle-handler';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  main() {
    const translator = new PageTranslator();
    const ytSubtitleController = createYouTubeSubtitleController();
    const ytSubtitleHandler = createYouTubeSubtitleHandler();

    // Listen for messages from background / popup
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.type === MESSAGE_TYPES.TOGGLE_PAGE) {
        void translator
          .toggle()
          .then((enabled) => {
            void chrome.runtime.sendMessage({ type: MESSAGE_TYPES.PAGE_STATE_CHANGED, enabled });
            sendResponse({ ok: true, data: { enabled } });
          })
          .catch(() => sendResponse({ ok: false, error: { message: 'Failed to toggle page translation' } }));
        return true;
      }

      if (msg?.type === MESSAGE_TYPES.GET_PAGE_STATE) {
        sendResponse({ ok: true, data: { enabled: translator.isEnabled() } });
        return;
      }

      if (msg?.type === MESSAGE_TYPES.GET_YT_SUBTITLE_STATE) {
        const ccState = ytSubtitleController.getState();
        // If handler is actively translating, report that state
        if (ytSubtitleHandler.isActive()) {
          sendResponse({ ok: true, data: { enabled: true } });
          return;
        }
        sendResponse(ccState);
        return;
      }

      if (msg?.type === MESSAGE_TYPES.TOGGLE_YT_SUBTITLE) {
        void (async () => {
          try {
            if (ytSubtitleHandler.isActive()) {
              // Stop translation
              ytSubtitleHandler.stop();
              sendResponse({ ok: true, data: { enabled: false } });
            } else {
              // Ensure CC is on, then start translation
              const ccState = ytSubtitleController.getState();
              if (ccState.ok && !ccState.data.enabled) {
                await ytSubtitleController.toggle();
              }
              await ytSubtitleHandler.start();
              sendResponse({ ok: true, data: { enabled: true } });
            }
          } catch {
            sendResponse({
              ok: false,
              error: {
                code: 'UNKNOWN',
                message: 'Unable to toggle YouTube subtitles right now.',
                retryable: false,
              },
            });
          }
        })();
        return true;
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
