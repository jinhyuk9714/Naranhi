import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Naranhi',
    description: 'Immersive bilingual translation — read in two languages side by side',
    version: '1.0.0',
    permissions: ['storage', 'contextMenus', 'activeTab', 'sidePanel'],
    host_permissions: ['http://localhost:8787/*'],
  },
  webExt: {
    startUrls: ['https://en.wikipedia.org/wiki/Main_Page'],
  },
});
