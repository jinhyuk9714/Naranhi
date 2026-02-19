import React from 'react';
import ReactDOM from 'react-dom/client';
import FloatingButton from './App';

export default defineContentScript({
  matches: ['<all_urls>'],
  cssInjectionMode: 'manual',

  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: 'naranhi-floating',
      position: 'inline',
      onMount: (container) => {
        const root = ReactDOM.createRoot(container);
        root.render(<FloatingButton />);
        return root;
      },
      onRemove: (root) => {
        root?.unmount();
      },
    });

    ui.mount();
  },
});
