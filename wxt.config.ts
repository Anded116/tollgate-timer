import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: ({ browser }) => ({
    name: 'Tollgate Timer',
    description: 'Динамический таймер входа на залипательные сайты: чем чаще заходишь, тем дольше ждёшь.',
    permissions: ['storage', 'tabs', 'webNavigation'],
    icons: {
      16: '/icon/16.png',
      32: '/icon/32.png',
      48: '/icon/48.png',
      128: '/icon/128.png',
    },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'tollgate@kolombet.dev',
              data_collection_permissions: { required: ['none'] },
            },
          },
        }
      : {}),
  }),
});
