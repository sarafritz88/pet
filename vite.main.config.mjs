import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      // uiohook-napi is a native (.node) module — it cannot be bundled
      external: ['uiohook-napi'],
    },
  },
});
