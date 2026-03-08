import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      // uiohook-napi is a native (.node) module — it cannot be bundled
      external: ['uiohook-napi'],
      output: {
        // uiohook-napi lives in resources/app/node_modules/ (via extraResources).
        // Node walks up from resources/app/.vite/build/ and finds it naturally, but
        // as a safety net we also register it in Module.globalPaths.
        banner: `;(function(){if(process.resourcesPath){var M=require('module'),p=require('path'),x=p.join(process.resourcesPath,'app','node_modules');if(!M.globalPaths.includes(x))M.globalPaths.push(x);}})();`,
      },
    },
  },
});
