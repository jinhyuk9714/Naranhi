/**
 * MAIN world content script — installs fetch/XHR hooks on YouTube pages
 * to intercept timedtext (subtitle) API responses.
 *
 * Runs in the page's MAIN world so it can monkey-patch global fetch/XHR.
 * Communicates with the isolated-world content script via postMessage.
 */
import { installHookBridge } from '@naranhi/youtube';

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  world: 'MAIN',
  runAt: 'document_start',

  main() {
    installHookBridge();
  },
});
